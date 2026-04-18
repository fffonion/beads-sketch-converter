export function getWorkspaceUiBusy(
  sourceProcessingBusy: boolean,
  editorRefreshBusy: boolean,
) {
  return sourceProcessingBusy || editorRefreshBusy;
}

export function getWorkspaceStageBusy(
  sourceProcessingBusy: boolean,
  _editorRefreshBusy: boolean,
) {
  return sourceProcessingBusy;
}
