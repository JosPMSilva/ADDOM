import React from 'react'
import MoaAgentsSection from './MoaAgentsSection.jsx'
import AgentPolicySettings from './AgentPolicySettings.jsx'

export default function SettingsSubagentsManager({
  agentSettings,
  setAgentSettings,
  providers,
  ...props
}) {
  return (
    <MoaAgentsSection {...props} providers={providers} focused>
      <AgentPolicySettings
        agentSettings={agentSettings}
        setAgentSettings={setAgentSettings}
        providers={providers}
      />
    </MoaAgentsSection>
  )
}
