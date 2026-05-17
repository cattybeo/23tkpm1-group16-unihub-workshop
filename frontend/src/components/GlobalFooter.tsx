import { ExternalLink, UserRound } from 'lucide-react'

const members = [
  'dhdmanh23@clc.fitus.edu.vn',
  'ntmthu22@clc.fitus.edu.vn',
  'pahao23@clc.fitus.edu.vn',
]

function FooterExternalLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex min-h-[32px] items-center gap-[6px] rounded-[8px] text-[14px] font-normal text-[#636366] transition hover:text-[#007AFF] focus:outline-none focus:ring-4 focus:ring-[#007AFF]/15"
    >
      Xem tại đây
      <ExternalLink className="h-[15px] w-[15px]" aria-hidden="true" />
    </a>
  )
}

function FooterPlaceholderLink() {
  return (
    <button
      type="button"
      className="inline-flex min-h-[32px] cursor-default items-center gap-[6px] rounded-[8px] text-[14px] font-normal text-[#636366] transition hover:text-[#007AFF] focus:outline-none focus:ring-4 focus:ring-[#007AFF]/15"
    >
      Xem tại đây
      <ExternalLink className="h-[15px] w-[15px]" aria-hidden="true" />
    </button>
  )
}

export function Footer() {
  return (
    <footer className="border-t border-[#E5E5EA] bg-white px-[16px] pb-[calc(88px+env(safe-area-inset-bottom))] pt-[30px] text-[#1C1C1E] sm:px-[24px] md:pb-[34px] lg:px-[32px]">
      {/* Desktop spacing: left / center / right columns are controlled by max-w, grid-cols, and justify-self classes below. */}
      <div className="mx-auto grid w-full max-w-[1200px] grid-cols-1 gap-[26px] md:grid-cols-3 md:items-start md:gap-[48px]">
        <section className="md:justify-self-start md:max-w-[520px]">
          <div className="mb-[12px]">
            <span className="text-[18px] font-bold tracking-normal">UniHub Workshop</span>
          </div>

          <h2 className="text-[13px] font-bold uppercase tracking-normal text-[#636366]">Disclaimer</h2>
          <p className="mt-[8px] max-w-[480px] text-[14px] leading-6 text-[#636366]">
            Đây là dự án môn học được thiết kế với mục đích học tập, nghiên cứu và minh họa quy trình xây dựng hệ thống đăng ký workshop. Sản phẩm không phục vụ mục đích thương mại và thuộc phạm vi học thuật tại Trường Đại học Khoa học Tự nhiên, ĐHQG-HCM.
          </p>
          <p className="mt-[10px] text-[13px] font-medium text-[#8E8E93]">
            © 2026 Nhóm 16. Nội dung demo có thể dùng dữ liệu giả lập.
          </p>
        </section>

        <section className="md:justify-self-center">
          <h2 className="text-[13px] font-bold uppercase tracking-normal text-[#636366]">Contact</h2>
          <ul className="mt-[8px] space-y-[4px]">
            {members.map(email => (
              <li key={email}>
                <a
                  href={`mailto:${email}`}
                  className="inline-flex min-h-[24px] items-center gap-[7px] text-[13px] font-normal text-[#636366] transition hover:text-[#007AFF] focus:outline-none focus:ring-4 focus:ring-[#007AFF]/15"
                >
                  <UserRound className="h-[14px] w-[14px] shrink-0" aria-hidden="true" />
                  {email}
                </a>
              </li>
            ))}
          </ul>
        </section>

        <section className="grid content-start gap-[14px] md:justify-self-end">
          <div>
            <h2 className="text-[13px] font-bold uppercase tracking-normal text-[#636366]">Mã nguồn dự án</h2>
            <FooterExternalLink href="https://github.com/cattybeo/23tkpm1-group16-unihub-workshop" />
          </div>

          <div>
            <h2 className="text-[13px] font-bold uppercase tracking-normal text-[#636366]">Điều khoản sử dụng</h2>
            <FooterPlaceholderLink />
          </div>

          <div>
            <h2 className="text-[13px] font-bold uppercase tracking-normal text-[#636366]">Chính sách quyền riêng tư</h2>
            <FooterPlaceholderLink />
          </div>
        </section>
      </div>
    </footer>
  )
}
