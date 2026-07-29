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
        <p>Folio Local 无需账号，笔记默认只保存在你的设备中。只有在你主动连接 Folio Cloud 后，相关数据才会上传用于跨设备同步。Folio 不投放广告，也不出售个人信息。</p>

        <h2>我们保存什么</h2>
        <p>连接 Folio Cloud 时，我们保存登录邮箱，以及你主动同步的笔记、标签、页面标题、链接、选中文本和修改时间。浏览器插件不会读取或上传完整网页内容。</p>

        <h2>数据如何使用</h2>
        <p>本地数据仅用于在当前设备上保存、搜索和导出。你确认合并或在已连接状态下记录时，数据才会通过 HTTPS 传输至 Folio Cloud，用于登录、备份和设备间同步。登录邮件通过配置的邮件服务发送。</p>

        <h2>你的选择</h2>
        <p>你可以随时导出数据、暂不合并本地笔记、断开插件，或在账号菜单中永久删除账号和全部云端笔记。本地数据可通过浏览器或应用的数据管理功能清除；清除浏览器数据或卸载应用也可能导致未同步笔记丢失。</p>

        <h2>联系我们</h2>
        <p>如果你对数据处理有疑问，请联系 <a href="mailto:official@warmbeing.com">official@warmbeing.com</a>。</p>
        <small>更新日期：2026 年 7 月 29 日</small>
      </article>
    </main>
  );
}
