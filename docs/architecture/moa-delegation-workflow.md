# MoA, Commands, and Task Delegation Workflow

This document visualizes the complete lifecycle of a Mixture of Agents (MoA) task delegation in ADDOM, from the initial user request through role resolution, orchestration planning, tool execution, and UI rendering.

## Architecture Diagram

```mermaid
flowchart TD
    %% User Inputs
    subgraph Input ["1. Trigger Surface"]
        direction TB
        UserChat["User Prompt\n(e.g., 'Refactor this, ask the reviewer agent')"]
        SlashCommand["Explicit Slash Command\n(e.g., /pipeline research-build)"]
        DirectTool["LLM calls delegate_to_agents tool"]
        
        UserChat --> DirectTool
        SlashCommand --> DirectTool
    end

    %% Preflight & Role Resolution
    subgraph Policy ["2. Policy & Role Setup (moa-policy.mjs)"]
        direction TB
        Normalize["Normalize Task Shape"]
        RoleResolve{"Role Specified?"}
        MatchPin["Use explicitly pinned role"]
        MatchSemantic["Semantic Role Fit Scoring\n(role-fit-scoring.mjs)"]
        ProposalEngine["Draft/Propose Role\n(role-proposal-engine.mjs)"]
        
        Normalize --> RoleResolve
        RoleResolve -- Yes --> MatchPin
        RoleResolve -- No --> MatchSemantic
        MatchSemantic -- "No match found" --> ProposalEngine
    end

    Input --> Policy

    %% Planning Phase
    subgraph Planner ["3. Orchestration Planning (delegation-planner.mjs)"]
        direction TB
        RiskTier["Compute Risk Tier & Cost"]
        PatternEval{"Select Orchestration Pattern"}
        
        SinglePattern["Single Specialist"]
        ParallelPattern["Parallel Independent"]
        SequentialPattern["Sequential Pipeline"]
        ReviewPattern["Review Gate"]
        CouncilPattern["Council / Consensus"]
        
        PatternEval --> |1 Task| SinglePattern
        PatternEval --> |Independent Tasks| ParallelPattern
        PatternEval --> |Step 1 -> Step 2| SequentialPattern
        PatternEval --> |Implement + Review| ReviewPattern
        PatternEval --> |Consensus Task| CouncilPattern
    end

    Policy --> Planner

    %% Execution Phase
    subgraph Execution ["4. Agent Execution (agent-executor.mjs)"]
        direction TB
        Memory["Inject Agent Scoped Memory<br>(agent-memory.mjs)"]
        
        subgraph Patterns ["Orchestration Pattern Handlers"]
            direction TB
            subgraph CouncilPatternNode ["Council / Consensus Pattern"]
                direction TB
                C1["Agent A (Drafts)"]
                C2["Agent B (Drafts)"]
                C3["Agent C (Drafts)"]
                CS["Synthesizer Agent<br>(Merges A, B, C into final output)"]
                C1 --> CS
                C2 --> CS
                C3 --> CS
            end
            
            subgraph PipelinePatternNode ["Sequential Pipeline Pattern"]
                direction TB
                P1["Step 1: Research Agent<br>(Outputs Findings)"]
                P2["Step 2: Coder Agent<br>(Receives P1 Output)"]
                P3["Step 3: Reviewer Agent<br>(Receives P2 Output)"]
                P1 --> P2
                P2 --> P3
            end
        end

        subgraph Runtime ["agent-runtime.mjs (Per Agent Step)"]
            direction TB
            Provider["Init Provider Stream"]
            Tools{"Use Commands / Tools?"}
            RunTool["Execute Tools<br>(command-tools-core.mjs / file-tools.mjs)"]
            StagedWrites["Stage File Writes"]
            
            Provider --> Tools
            Tools -- Yes --> RunTool
            RunTool --> StagedWrites
            Tools -- No --> Provider
        end
        
        Memory --> Runtime
        Runtime -.-> |Next step/retry| Runtime
    end

    Planner --> Patterns
    Patterns --> Memory

    %% IPC and UI
    subgraph IPC ["5. IPC Broadcasts"]
        direction TB
        EmitStart["Emit: moa:delegation-start"]
        EmitProgress["Emit: moa:agent-progress"]
        EmitDone["Emit: moa:delegation-done"]
    end

    Execution --> IPC

    %% Renderer Output
    subgraph UI ["6. UI Rendering (Renderer)"]
        direction TB
        LiveStream["LiveExecutionStreamBlock\n(Shows real-time agent thoughts)"]
        ToolCard["ToolActivityLine\n(Shows running commands)"]
        ResultsCard["DelegationResultsCard\n(Shows final summaries & writes)"]
        MoAPanel["MoA Panel\n(Ticket/Pipeline state)"]
        
        LiveStream --> ToolCard
        ToolCard --> ResultsCard
    end

    IPC --> UI
```

## Key Workflow Steps

1. **Trigger Phase**: The process begins either via direct chat ("Ask the test agent to write unit tests for this file"), an explicit slash command (like `/pipeline`), or a generic LLM dynamically deciding to use the `delegate_to_agents` tool.
2. **Policy & Role Setup**: `moa-policy.mjs` normalizes the request. If the user didn't specify exactly *which* agent should handle it, `role-fit-scoring.mjs` uses semantic matching (checking overlap between the task description and built-in skill catalogs/agent instructions) to find the best fit. If it fails, the system drafts a proposed role to the user.
3. **Orchestration Planning**: `delegation-planner.mjs` looks at the tasks and calculates the risk and estimated cost. Based on the shapes of the tasks, it assigns an orchestration pattern. Two of the most powerful patterns are:
   - **Sequential Pipeline**: Explicit, multi-step workflows. The output of Step 1 (e.g., a "research_agent" creating a plan) is automatically injected into the `injected_context` of Step 2 (e.g., a "coder_agent" implementing the plan). Pipelines can be triggered dynamically by the planner or explicitly by the user (e.g., `/pipeline research-build`).
   - **Council (Consensus)**: A multi-member pattern designed for complex decisions or high-risk tasks. The same task is sent to multiple different agent roles simultaneously. Once all members finish drafting their responses, a final "Synthesizer" agent reviews all the drafts and merges them into a single, cohesive consensus result.
4. **Execution**: `agent-executor.mjs` handles the overarching pattern (manages handoffs in a pipeline, or the synthesis in a council). `agent-runtime.mjs` runs the actual model stream for a given agent step. This is where the agent can interact with **Commands** (exposed tools validated through `command-tools-core.mjs` and executing in the background sandbox).
5. **IPC & Rendering**: As agents think, use tools, and stage files, events are broadcast via IPC to the frontend. The renderer hydrated these events into the `LiveExecutionStreamBlock` (for real-time tracking) and ultimately a `DelegationResultsCard` summarizing what was accomplished.
