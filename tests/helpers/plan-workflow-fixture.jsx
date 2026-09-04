import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import PlanDirectionCard from '../../src/renderer/components/chat/PlanDirectionCard.jsx'
import DocumentCompanionView from '../../src/renderer/components/chat/DocumentCompanionView.jsx'
import useAppStore from '../../src/renderer/store/useAppStore.js'
import useChatStore from '../../src/renderer/store/useChatStore.js'
import useEditorStore from '../../src/renderer/store/useEditorStore.js'
import '../../src/renderer/styles/globals.css'

const filePath = 'C:/ADDOM-data/managed-plans/scope/plan-one.md'
const documentState = {
  ok: true, name: 'Plan.md', revision: 4, lifecycle: 'ready_for_review',
  content: '# Implementation plan\n\n## Scope\n\nKeep the existing project data.\n\n## Verification\n\nExercise the complete plan flow.',
  review: { pendingChanges: [] }, document: { filePath },
}
window.fixture = { calls: [], fail: false, cancel: false }
window.addom = {
  documents: {
    readManagedPlan: async () => documentState,
    revealManagedPlan: async (payload) => { window.fixture.calls.push(['reveal', payload]); return { ok: true } },
    saveManagedPlanCopy: async (payload) => {
      window.fixture.calls.push(['save', payload])
      if (window.fixture.fail) throw new Error('Simulated write failure')
      return window.fixture.cancel ? { cancelled: true } : { ok: true, filePath: 'C:/project/Plan.md' }
    },
    implementManagedPlan: async (payload) => {
      window.fixture.calls.push(['implement', payload])
      return { plan: { revision: 5, lifecycle: 'approved' }, handoff: { planId: 'plan-one', revision: 4, threadId: 'thread-one' } }
    },
  },
  file: { readFile: async (...args) => { window.fixture.calls.push(['read', ...args]); return { ok: true, content: documentState.content } } },
  settings: { set: async () => ({}) },
}
useAppStore.setState({ projectFolder: 'C:/project', activeThreadId: 'thread-one' })
window.fixture.appState = () => useAppStore.getState()
window.fixture.chatState = () => useChatStore.getState()
window.fixture.editorState = () => useEditorStore.getState()

function Fixture() {
  const [plan, setPlan] = useState({
    planId: 'plan-one', revision: 1, lifecycle: 'awaiting_decision',
    direction: { stage: 'review', summary: 'Preserve local data and improve the plan workflow.', questions: [] },
  })
  const [error, setError] = useState('')
  const [companion, setCompanion] = useState(false)
  return <main className="h-screen bg-surface p-4 text-text-primary">
    <div className="mb-4 flex gap-4">
      <button onClick={() => setPlan((current) => ({ ...current, revision: current.revision + 1, direction: { ...current.direction, stage: 'review', summary: 'Updated direction is ready.' } }))}>Complete update</button>
      <button onClick={() => setCompanion(true)}>Show document</button>
    </div>
    {companion ? <DocumentCompanionView view={{
      key: 'plan-one', sourceKind: 'managed_plan', projectRoot: 'C:/project', threadId: 'thread-one', planId: 'plan-one', initialDocument: documentState,
    }} /> : <div className="mx-auto max-w-2xl"><PlanDirectionCard
      plan={plan} error={error} disabled={plan.direction.stage === 'synthesizing'}
      onChangeDirection={async (feedback) => {
        window.fixture.calls.push(['direction', feedback])
        await new Promise((resolve) => { window.fixture.resolveSubmit = resolve })
        if (window.fixture.fail) { setError('Update failed'); return false }
        setPlan((current) => ({ ...current, direction: { ...current.direction, stage: 'synthesizing' } }))
        return true
      }}
    /></div>}
  </main>
}
createRoot(document.getElementById('root')).render(<Fixture />)
