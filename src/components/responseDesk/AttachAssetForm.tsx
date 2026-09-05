"use client";
// Entity type switches which entity list is shown; all four lists arrive from the server page.
import { useState } from "react";

type Opt = { id: string; label: string };
export function AttachAssetForm({ action, entities, assets, defaultEntity = "conversation" }: {
  action: (fd: FormData) => void | Promise<void>;
  entities: Record<string, Opt[]>;
  assets: Opt[];
  defaultEntity?: string;
}) {
  const [entity, setEntity] = useState(defaultEntity);
  const list = entities[entity] ?? [];
  return (
    <form action={action} className="grid gap-2 sm:grid-cols-[10rem_1fr_1fr_auto]">
      <div>
        <label className="label" htmlFor="attach-entity">Attach to</label>
        <select id="attach-entity" name="entity" className="input" value={entity} onChange={(e) => setEntity(e.target.value)}>
          <option value="conversation">Conversation</option><option value="statement">Statement</option><option value="topic">Topic</option><option value="interview">Interview request</option>
        </select>
      </div>
      <div>
        <label className="label" htmlFor="attach-entityId">Record</label>
        <select id="attach-entityId" name="entityId" className="input" required defaultValue="" key={entity}>
          <option value="" disabled>{list.length ? "Choose one" : "Nothing to attach to yet"}</option>
          {list.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="attach-assetId">Asset</label>
        <select id="attach-assetId" name="assetId" className="input" required defaultValue="">
          <option value="" disabled>{assets.length ? "Choose an asset" : "No assets in the library"}</option>
          {assets.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </div>
      <div className="flex items-end"><button className="btn btn-primary" disabled={!list.length || !assets.length}>Attach</button></div>
    </form>
  );
}
