// PROTOTYPE (wayfinder #17): handover + day-to-day Back Office variants. ?variant=A|B|C|D&role=owner|staff
import { VariantHost } from "@/prototype-back-office/bo-switcher";
import HandoverA from "@/prototype-back-office/handover-a";
import HandoverB from "@/prototype-back-office/handover-b";
import HandoverC from "@/prototype-back-office/handover-c";
import HandoverD from "@/prototype-back-office/handover-d";

export default function HandoverPrototype() {
  return (
    <VariantHost
      variants={[
        { key: "A", name: "Today queues", Component: HandoverA },
        { key: "B", name: "Customer counter", Component: HandoverB },
        { key: "C", name: "Handover desk + order board", Component: HandoverC },
        { key: "D", name: "Today + Counter (A + C)", Component: HandoverD },
      ]}
    />
  );
}
