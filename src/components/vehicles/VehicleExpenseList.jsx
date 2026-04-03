import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Download, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import VehicleExpenseForm from "./VehicleExpenseForm";

const EXPENSE_TYPE_LABELS = {
  purchase: "Purchase",
  repair: "Repair",
  maintenance: "Maintenance",
  insurance: "Insurance",
  registration: "Registration",
  fuel: "Fuel",
  other: "Other",
};

export default function VehicleExpenseList({ vehicle }) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ["vehicle-expenses", vehicle.id],
    queryFn: () => base44.entities.VehicleExpense.filter({ vehicle_id: vehicle.id }),
    enabled: !!vehicle.id,
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.VehicleExpense.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["vehicle-expenses", vehicle.id] }),
  });

  const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

  return (
    <div className="space-y-4 mt-6 pt-6 border-t border-gray-200">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">Expenses</h3>
          <p className="text-sm text-gray-500 mt-0.5">Total: ${totalExpenses.toFixed(2)}</p>
        </div>
        <Button
          onClick={() => setDialogOpen(true)}
          size="sm"
          className="gap-2"
          style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}
        >
          <Plus className="h-4 w-4" />
          Add Expense
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : expenses.length === 0 ? (
        <div className="text-center py-8 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-500">No expenses recorded yet</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {expenses.map((exp) => (
            <div key={exp.id} className="flex items-start justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-semibold text-gray-900">
                    ${exp.amount.toFixed(2)}
                  </span>
                  <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                    {EXPENSE_TYPE_LABELS[exp.expense_type]}
                  </span>
                </div>
                {exp.description && (
                  <p className="text-xs text-gray-600 mb-1">{exp.description}</p>
                )}
                <p className="text-xs text-gray-400">
                  {format(new Date(exp.expense_date), "MMM d, yyyy")}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                {exp.receipt_url && (
                  <a
                    href={exp.receipt_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 hover:bg-gray-200 rounded transition-colors"
                  >
                    <Download className="h-4 w-4 text-gray-600" />
                  </a>
                )}
                <button
                  onClick={() => deleteMutation.mutate(exp.id)}
                  disabled={deleteMutation.isPending}
                  className="p-1.5 hover:bg-red-100 rounded transition-colors disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4 text-red-500" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <VehicleExpenseForm vehicle={vehicle} open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}