// PROTOTYPE (wayfinder #16): arrival + Shipping Fee invoicing variants. ?variant=A|B|C&role=owner|staff
import { VariantHost } from "@/prototype-back-office/bo-switcher";
import ArrivalA from "@/prototype-back-office/arrival-a";
import ArrivalB from "@/prototype-back-office/arrival-b";
import ArrivalC from "@/prototype-back-office/arrival-c";

export default function ArrivalPrototype() {
  return (
    <VariantHost
      variants={[
        { key: "A", name: "Arrived stage card", Component: ArrivalA },
        { key: "B", name: "Wizard + Invoices inbox", Component: ArrivalB },
        { key: "C", name: "Window ledger", Component: ArrivalC },
      ]}
    />
  );
}
