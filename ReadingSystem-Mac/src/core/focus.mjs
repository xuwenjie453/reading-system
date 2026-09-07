// focus.mjs — Focus 派生（INV-F1/F2）：Focus = derive(iPad ViewState)，无公开 set_focus
//
// TOPOLOGY_VIEW(graph) → Block（该图 root Block）
// BLOCK_VIEW(graph, block) → Block
// NODE_VIEW(graph, node) → Node
// 三态分离（policy.focus）：ConfirmedViewState / LastKnownViewState / TurnContext。

export function deriveFocus(viewState) {
  if (!viewState || !viewState.view_kind || !viewState.graph_id) return null;
  switch (viewState.view_kind) {
    case 'TOPOLOGY_VIEW':
      return { type: 'BLOCK', entity_id: null, graph_id: viewState.graph_id, note: 'root block of graph' };
    case 'BLOCK_VIEW':
      return { type: 'BLOCK', entity_id: viewState.entity_id, graph_id: viewState.graph_id };
    case 'NODE_VIEW':
      return { type: 'NODE', entity_id: viewState.entity_id, graph_id: viewState.graph_id };
    default:
      return null;
  }
}

/** TurnContext 冻结（MASTER C.1 / 01_QA_TURN_WORKFLOW）：提交瞬间生效 */
export function freezeTurnContext({ turnId, confirmedView, session, graphRevision, profileSnapshotId, question }) {
  const focus = deriveFocus(confirmedView);
  return {
    qa_turn_id: turnId,
    graph_id: confirmedView?.graph_id ?? null,
    focus_entity_id: focus?.type === 'NODE' ? focus.entity_id : (focus?.type === 'BLOCK' ? focus.entity_id : null),
    focus_type: focus?.type ?? null,
    basis_view_revision: confirmedView?.view_revision ?? 0,
    session_epoch: session.session_epoch,
    graph_revision_basis: graphRevision,
    prompt_profile_snapshot_id: profileSnapshotId,
    question,
    frozen_at: new Date().toISOString(),
    focus_authority: confirmedView ? 'CONFIRMED' : 'UNCONFIRMED',
  };
}
