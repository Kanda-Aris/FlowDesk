// The invite link carries a secret token: keep it out of Referer headers and search engines.
export const metadata = {
  title: 'เข้าร่วม Workspace · FlowDesk',
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
};
export default function JoinLayout({ children }) { return children; }
