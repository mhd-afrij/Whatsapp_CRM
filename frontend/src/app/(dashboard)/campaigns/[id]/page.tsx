import CampaignDetailPage from "./campaign-detail-client";

export function generateStaticParams() {
  return [{ id: "1" }];
}

export default function Page() {
  return <CampaignDetailPage />;
}

