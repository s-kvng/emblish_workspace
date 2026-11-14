import UnsubscribeView from "@/components/storefront/unsubscribe-view";

export const metadata = {
  title: "Stop alerts · Emblish",
  robots: { index: false },
};

/** The one-tap unsubscribe link every Window Alert carries; no sign-in. */
export default async function UnsubscribePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <UnsubscribeView code={code} />;
}
