import { z } from 'zod'

const MssvSchema = z.string().trim().regex(/^[A-Za-z0-9]{6,20}$/, 'MSSV không hợp lệ.')
const AccountSchema = z.string().trim().min(1, 'Vui lòng nhập tài khoản.').max(254, 'Tài khoản quá dài.').refine(
  value => MssvSchema.safeParse(value).success || z.string().email().safeParse(value).success,
  'Tài khoản phải là MSSV hoặc email hợp lệ.',
)

export const LoginFormSchema = z.object({
  account: AccountSchema,
  password: z.string().min(1, 'Vui lòng nhập mật khẩu.').max(128, 'Mật khẩu quá dài.'),
})

export const ChangePasswordFormSchema = z.object({
  newPassword: z.string().min(6, 'Mật khẩu phải có ít nhất 6 ký tự.').max(128, 'Mật khẩu quá dài.'),
  confirm: z.string(),
}).superRefine((data, ctx) => {
  if (data.newPassword === '123') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['newPassword'],
      message: 'Không được dùng lại mật khẩu mặc định.',
    })
  }

  if (data.newPassword !== data.confirm) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['confirm'],
      message: 'Mật khẩu xác nhận không khớp.',
    })
  }
})

export function firstZodMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Dữ liệu không hợp lệ.'
}
