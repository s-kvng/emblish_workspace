// PROTOTYPE (wayfinder #15): Product editor variants. ?variant=A|B|C&role=owner|staff
import { VariantHost } from "@/prototype-back-office/bo-switcher";
import ProductA from "@/prototype-back-office/product-a";
import ProductB from "@/prototype-back-office/product-b";
import ProductC from "@/prototype-back-office/product-c";

export default function ProductPrototype() {
  return (
    <VariantHost
      variants={[
        { key: "A", name: "One long form", Component: ProductA },
        { key: "B", name: "Step-by-step wizard", Component: ProductB },
        { key: "C", name: "Catalog + product hub", Component: ProductC },
      ]}
    />
  );
}
