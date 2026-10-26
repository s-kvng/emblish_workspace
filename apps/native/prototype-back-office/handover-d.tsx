// PROTOTYPE (wayfinder #17): handover variant D, "Today + Counter" (A's home with C's keypad desk).
// Today's queues stay the home screen. The Counter opens as a dark overlay from three places: the raised
// centre "Hand over" tab button (any tab), the "Customer at the counter?" banner on Today, and an order's
// "Hand over" button (aimed at that order, so "no code" jumps straight to the override).
import type { Role } from "./bo-data";
import HandoverA from "./handover-a";

export default function HandoverD({ role }: { role: Role }) {
  return <HandoverA role={role} withCounter />;
}
