import { z } from 'zod'

const AccountSchema = z.string().trim().min(1, 'Vui lòng nhập tài khoản.').max(254, 'Tài khoản quá dài.')
const PasswordSchema = z.string().min(1, 'Vui lòng nhập mật khẩu.').max(128, 'Mật khẩu quá dài.')

export const StudentLoginFormSchema = z.object({
  account: AccountSchema,
  password: PasswordSchema,
})

export const StaffLoginFormSchema = z.object({
  account: AccountSchema.refine((value) => value.includes('@'), 'Tài khoản nhân viên phải là email.'),
  password: PasswordSchema,
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
