import Link from "next/link";

export const metadata = {
  title: "Privacy & Data · Folio",
  description: "Folio privacy and data practices · Folio 隐私与数据说明。",
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
        <p>为运行 Folio Cloud，数据会由 Vercel（应用托管）、Neon（数据库）以及配置的邮件投递服务处理。这些服务商仅代表 Folio 提供必要的基础设施。我们不会向广告商、数据经纪商或其他无关第三方共享数据。</p>

        <h2>你的选择</h2>
        <p>你可以随时导出数据、暂不合并本地笔记、断开插件，或在账号菜单中永久删除账号和全部云端笔记。本地数据可通过浏览器或应用的数据管理功能清除；清除浏览器数据或卸载应用也可能导致未同步笔记丢失。</p>

        <h2>联系我们</h2>
        <p>如果你对数据处理有疑问，请联系 <a href="mailto:official@warmbeing.com">official@warmbeing.com</a>。</p>

        <h2>Chrome 网上应用店有限使用承诺</h2>
        <p>Folio 对通过 Google API（包括 Chrome API）获得的信息的使用与传输将遵守 Chrome Web Store User Data Policy，包括 Limited Use 要求。Folio 仅将这些数据用于提供用户主动使用的记录与同步功能，不用于广告、信用评估或出售给第三方，也不允许人工读取，除非获得用户对特定支持请求的明确同意，或法律与安全义务另有要求。</p>

        <hr />

        <p className="eyebrow">Every idea matters.</p>
        <h1>Privacy &amp; Data</h1>
        <p>Folio Local does not require an account. Notes are stored on your device by default. Data is uploaded for cross-device sync only after you explicitly connect Folio Cloud. Folio does not serve ads or sell personal information.</p>

        <h2>What we store</h2>
        <p>When you connect Folio Cloud, we store your login email and the notes you choose to sync, including tags, page titles, URLs, selected text, and modification times. A revocable device token is stored locally to keep the extension connected. The extension does not read or upload complete web pages.</p>

        <h2>How data is used</h2>
        <p>Local data is used only to save, search, and export notes on the current device. After you connect cloud sync, the extension transfers your chosen notes over HTTPS to Folio Cloud for authentication, backup, and synchronization between your devices. Folio Cloud uses Vercel for application hosting, Neon for database hosting, and a configured email delivery provider for login messages. These providers process data only as necessary to operate Folio. We do not share data with advertisers, data brokers, or unrelated third parties.</p>

        <h2>Your choices</h2>
        <p>You can export your data, keep notes local, disconnect the extension, or permanently delete your account and all cloud notes from the account menu. You can clear local data through your browser or app data settings. Clearing browser data or uninstalling Folio may remove notes that have not been synced.</p>

        <h2>Chrome Web Store Limited Use</h2>
        <p>Folio&apos;s use and transfer of information received from Google APIs, including Chrome APIs, adheres to the Chrome Web Store User Data Policy, including the Limited Use requirements. Folio uses this information only to provide user-requested capture and sync features. It is not used for advertising or credit decisions, sold to third parties, or made available for humans to read except with explicit consent for a specific support request or when required for security or legal obligations.</p>

        <h2>Contact</h2>
        <p>For questions about data handling, contact <a href="mailto:official@warmbeing.com">official@warmbeing.com</a>.</p>
        <small>Last updated / 更新日期：August 27, 2026 · 2026 年 8 月 27 日</small>
      </article>
    </main>
  );
}
