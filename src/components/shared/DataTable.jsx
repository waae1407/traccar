import React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function DataTable({ columns, data, isLoading, onRowClick, emptyMessage }) {
  if (isLoading) {
    return (
      <Card className="overflow-hidden shadow-sm">
        <div className="p-4 space-y-3">
          {Array(5).fill(0).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card className="p-8 text-center shadow-sm">
        <p className="text-muted-foreground">{emptyMessage || "No data found"}</p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              {columns.map((col) => (
                <TableHead key={col.key} className="font-semibold text-foreground/80">
                  {col.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row, idx) => (
              <TableRow
                key={row.id || idx}
                className={onRowClick ? "cursor-pointer hover:bg-muted/50 transition-colors" : ""}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((col) => (
                  <TableCell key={col.key}>
                    {col.render ? col.render(row) : row[col.key]}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}