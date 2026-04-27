"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  EmployeeForm,
  type LocationOption,
} from "@/components/admin/employees/employee-form";
import { ServiceForm } from "@/components/admin/services/service-form";
import {
  ManualBookingForm,
  type EmployeePickOption,
} from "@/components/admin/accounts/manual-booking-form";
import { isoDateString } from "@/lib/time/week";

export type QuickActionId =
  | "new-employee"
  | "new-service"
  | "manual-booking";

interface QuickActionsContextValue {
  open: (id: QuickActionId) => void;
}

const QuickActionsContext = createContext<QuickActionsContextValue | null>(
  null,
);

const NOOP_CONTEXT: QuickActionsContextValue = { open: () => {} };

export function useQuickActions(): QuickActionsContextValue {
  return useContext(QuickActionsContext) ?? NOOP_CONTEXT;
}

interface ProviderProps {
  locations: LocationOption[];
  defaultLocationId: string;
  employees: EmployeePickOption[];
  children: ReactNode;
}

type DialogState = "closed" | "new-employee" | "new-service" | "manual-booking";

export function QuickActionsProvider({
  locations,
  defaultLocationId,
  employees,
  children,
}: ProviderProps) {
  const [dialog, setDialog] = useState<DialogState>("closed");
  const close = useCallback(() => setDialog("closed"), []);

  const open = useCallback((id: QuickActionId) => {
    setDialog(id);
  }, []);

  const todayIso = isoDateString(new Date());

  return (
    <QuickActionsContext.Provider value={{ open }}>
      {children}

      <Dialog
        open={dialog === "new-employee"}
        onOpenChange={(o) => !o && close()}
      >
        <DialogContent className="sm:max-w-2xl">
          <EmployeeForm
            mode="create"
            defaults={{
              email: "",
              firstName: "",
              lastName: "",
              roleLabel: "",
              pensum: 100,
              entryDate: isoDateString(new Date()),
              exitDate: "",
              locationId: defaultLocationId,
              vacationDaysPerYear: 25,
              weeklyTargetMinutes: 2520,
              hazMinutesPerWeek: 2700,
              isActive: true,
            }}
            locations={locations}
            onSuccess={close}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={dialog === "new-service"}
        onOpenChange={(o) => !o && close()}
      >
        <DialogContent className="sm:max-w-xl">
          <ServiceForm
            mode="create"
            defaults={{
              name: "",
              code: "",
              startTime: "08:00",
              endTime: "17:00",
              breakMinutes: 30,
              comment: "",
              isActive: true,
            }}
            onSuccess={close}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={dialog === "manual-booking"}
        onOpenChange={(o) => !o && close()}
      >
        <DialogContent className="sm:max-w-2xl">
          <ManualBookingForm
            employees={employees}
            defaults={{
              employeeId: employees[0]?.id ?? "",
              accountType: "ZEITSALDO",
              date: todayIso,
              bookingType: "MANUAL_CREDIT",
            }}
            onSuccess={close}
          />
        </DialogContent>
      </Dialog>
    </QuickActionsContext.Provider>
  );
}
