"use client";

import {
  createContext,
  useContext,
  type ComponentProps,
  type ReactNode,
} from "react";

export const StaffReadOnlyContext = createContext(false);
export const RemoteReadOnlyContext = createContext(false);
export function useStaffReadOnly() {
  const staff = useContext(StaffReadOnlyContext);
  const remote = useContext(RemoteReadOnlyContext);
  return staff || remote;
}
/** Only wrap mutation fields, leaving navigation, search and history interactive. */
export function ReadOnlyFields({ children }: { children: ReactNode }) {
  const readOnly = useStaffReadOnly();
  return (
    <fieldset className="staff-readonly-fields" disabled={readOnly}>
      {children}
    </fieldset>
  );
}
export function MutationButton(props: ComponentProps<"button">) {
  const readOnly = useStaffReadOnly();
  return <button {...props} disabled={readOnly || props.disabled} />;
}
