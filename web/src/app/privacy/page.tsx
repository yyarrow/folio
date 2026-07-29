import Link from "next/link";

export const metadata = {
  title: "隐私与数据 · Folio",
  description: "Folio 的隐私与数据说明。",
};

export default function PrivacyPage() {
  return (
    <main className="legal-shell">
      <article className="legal-card">
        <Link href="/" className="legal-brand">← Folio</Link>
        <p className="eyebrow">Every idea matters.</p>
        <h1>隐私与数据</h1>
        <p>Folio 只保存提供笔记与跨设备同步所需的数据，不投放广告，也不出售个人信息。</p>

        <h2>我们保存什么</h2>
        <p>登录邮箱，以及你主动记录的笔记、标签、页面标题、链接、选中文本和修改时间。浏览器插件不会读取或上传完整网页内容。</p>

        <h2>数据如何使用</h2>
        <p>这些数据仅用于登录、保存、搜索、导出和在你的设备之间同步。登录邮件通过配置的邮件服务发送，笔记保存在 Folio 的云端数据库中，传输过程使用 HTTPS。</p>

        <h2>你的选择</h2>
        <p>你可以随时导出数据、断开插件，或在账号菜单中永久删除账号和全部云端笔记。本地离线副本可通过浏览器或应用的数据管理功能清除。</p>

        <h2>联系我们</h2>
        <p>如果你对数据处理有疑问，请联系 <a href="mailto:official@warmbeing.com">official@warmbeing.com</a>。</p>
        <small>更新日期：2026 年 7 月 29 日</small>
      </article>
    </main>
  );
}
