import { stageImport } from "@/server/contacts";

export default function NewImport() {
  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 text-xl font-semibold">Import contacts</h1>
      <p className="mb-4 text-sm text-neutral-600">CSV or XLSX exports from Onclusive, Cision, Muck Rack, Meltwater, or a spreadsheet you made. Column names are detected automatically; you confirm the mapping on the next step.</p>
      <div className="grid gap-3">
        <form action={stageImport} className="card space-y-2 p-4">
          <input type="hidden" name="source" value="csv" />
          <h2 className="text-sm font-semibold">Upload a file</h2>
          <input name="file" type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" className="input" required />
          <button className="btn btn-primary">Continue</button>
        </form>
        <form action={stageImport} className="card space-y-2 p-4">
          <input type="hidden" name="source" value="paste" />
          <h2 className="text-sm font-semibold">Paste a block of text</h2>
          <textarea name="text" rows={5} className="input font-mono text-xs" placeholder={"Name\tOutlet\tEmail\nJane Doe\tCBC Toronto\tjane@cbc.ca"} required />
          <button className="btn">Continue</button>
        </form>
        <form action={stageImport} className="card space-y-2 p-4">
          <input type="hidden" name="source" value="gsheet" />
          <h2 className="text-sm font-semibold">Google Sheet URL</h2>
          <p className="text-xs text-neutral-600">The sheet must be shared as “Anyone with the link can view”.</p>
          <input name="url" type="url" className="input" placeholder="https://docs.google.com/spreadsheets/d/…" required />
          <button className="btn">Continue</button>
        </form>
      </div>
    </div>
  );
}
