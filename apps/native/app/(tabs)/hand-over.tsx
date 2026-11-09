import { Redirect } from "expo-router";

// The centre tab never shows a screen of its own: its button opens the Counter overlay.
// Reached any other way (a deep link), it goes to the Counter too.
export default function HandOver() {
  return <Redirect href="/counter" />;
}
