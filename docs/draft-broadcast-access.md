# Draft presentation and broadcast access (#234)

The selected edition's Admin draft control room provides the presenter and overlay links and the OBS source URL. The public draft page contains only the spectator board. Direct `?presenter=1` access requires the server-checked `view_streaming` capability for that edition (or existing global Developer read access); ordinary players, captains and unrelated-edition staff cannot bypass this by entering the URL. The presenter continues to read only released public draft snapshots.

The OBS **output URL** remains deliberately public and read-only. It exposes only the same released data as the spectator board, plus already-public broadcast artwork. It has no controls, private session data or staff privileges. This is distinct from the protected management tools: OBS Browser Source can load and reconnect without importing an organizer's login session or embedding credentials. The output's existing URL, transparent background and polling remain unchanged. Copy and launch controls are available only in the authorized back office.

This preserves current OBS sources and does not require new signing secrets or permission-bearing URL tokens. Unreleased drafts remain unavailable through both the output page and its polling API. No private staff snapshot is passed to either presenter or overlay.
