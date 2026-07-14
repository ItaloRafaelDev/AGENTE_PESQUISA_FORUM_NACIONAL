import { z } from 'zod'

export const DEFAULT_PLATFORM_URLS = {
  cpiQueueUrl:
    'https://adm.cpicentral.com.br/zpersEspecial/pesquisas/aguardando/mod_t_aguardando.aspx',
  deskDataPeopleUrl: 'https://deskdata.com.br/pessoas/'
} as const

const httpsUrlSchema = z
  .string()
  .url()
  .refine((value) => value.startsWith('https://'), {
    message: 'A plataforma deve utilizar HTTPS'
  })

const platformUrlsSchema = z.object({
  cpiQueueUrl: httpsUrlSchema,
  deskDataPeopleUrl: httpsUrlSchema
})

export type PlatformUrls = z.infer<typeof platformUrlsSchema>

export function parsePlatformUrls(input: unknown = DEFAULT_PLATFORM_URLS): PlatformUrls {
  return platformUrlsSchema.parse(input)
}
