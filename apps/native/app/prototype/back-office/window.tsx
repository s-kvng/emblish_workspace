// PROTOTYPE (wayfinder #15): Order Window variants. ?variant=A|B|C&role=owner|staff
import { VariantHost } from "@/prototype-back-office/bo-switcher";
import WindowA from "@/prototype-back-office/window-a";
import WindowB from "@/prototype-back-office/window-b";
import WindowC from "@/prototype-back-office/window-c";

export default function WindowPrototype() {
  return (
    <VariantHost
      variants={[
        { key: "A", name: "Detail page + forms", Component: WindowA },
        { key: "B", name: "Stage timeline", Component: WindowB },
        { key: "C", name: "Board + action sheets", Component: WindowC },
      ]}
    />
  );
}
