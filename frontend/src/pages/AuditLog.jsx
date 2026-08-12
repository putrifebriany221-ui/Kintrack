import { useEffect, useState } from "react";
import api from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const ACTIONS = ["CREATE", "UPDATE", "DELETE", "CALCULATE", "SUBMIT", "VERIFY", "APPROVE", "LOCK", "UNLOCK", "LOGIN"];
const COLOR = { CREATE: "bg-emerald-600", UPDATE: "bg-blue-600", DELETE: "bg-rose-600", CALCULATE: "bg-indigo-600", SUBMIT: "bg-amber-500", VERIFY: "bg-cyan-600", APPROVE: "bg-emerald-700", LOCK: "bg-slate-700", UNLOCK: "bg-slate-500", LOGIN: "bg-slate-400" };

export default function AuditLog() {
  const [logs, setLogs] = useState([]);
  const [action, setAction] = useState("all");

  useEffect(() => {
    const params = {};
    if (action !== "all") params.action = action;
    api.get("/audit-logs", { params }).then((r) => setLogs(r.data));
  }, [action]);

  return (
    <div>
      <PageHeader title="Audit Log" subtitle="Jejak audit seluruh perubahan penting dalam sistem" />
      <div className="mb-4 max-w-xs no-print">
        <Select value={action} onValueChange={setAction}>
          <SelectTrigger data-testid="audit-action-filter"><SelectValue placeholder="Filter aksi" /></SelectTrigger>
          <SelectContent><SelectItem value="all">Semua Aksi</SelectItem>{ACTIONS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <Card><CardContent className="px-0 py-0"><div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Waktu</TableHead><TableHead>Pengguna</TableHead><TableHead>Peran</TableHead><TableHead>Aksi</TableHead><TableHead>Modul</TableHead><TableHead>Detail</TableHead><TableHead>IP</TableHead></TableRow></TableHeader>
          <TableBody>
            {logs.map((l, i) => (
              <TableRow key={l.id} data-testid={`audit-row-${i}`}>
                <TableCell className="whitespace-nowrap font-mono text-xs">{new Date(l.timestamp).toLocaleString("id-ID")}</TableCell>
                <TableCell className="font-medium">{l.user_name}</TableCell>
                <TableCell className="text-xs text-slate-500">{l.role}</TableCell>
                <TableCell><Badge className={`${COLOR[l.action] || "bg-slate-400"} text-white text-[10px]`}>{l.action}</Badge></TableCell>
                <TableCell className="text-sm">{l.module}</TableCell>
                <TableCell className="max-w-[280px] truncate text-xs text-slate-500">{l.new_value ? JSON.stringify(l.new_value) : "-"}</TableCell>
                <TableCell className="font-mono text-xs text-slate-400">{l.ip_address || "-"}</TableCell>
              </TableRow>
            ))}
            {!logs.length && <TableRow><TableCell colSpan={7} className="py-10 text-center text-slate-400">Belum ada catatan audit.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div></CardContent></Card>
    </div>
  );
}
