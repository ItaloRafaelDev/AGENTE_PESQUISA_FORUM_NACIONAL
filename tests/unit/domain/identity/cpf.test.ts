import { describe, expect, it } from 'vitest'
import { isValidCpf, maskCpfForLog } from '@/domain/identity/cpf'

describe('maskCpfForLog', () => {
  it('deve mascarar um CPF formatado e manter somente os dois últimos dígitos', () => {
    expect(maskCpfForLog('529.982.247-25')).toBe('***.***.***-25')
  })

  it('deve mascarar um CPF sem formatação', () => {
    expect(maskCpfForLog('52998224725')).toBe('***.***.***-25')
  })

  it('deve ocultar completamente um valor com quantidade inválida de dígitos', () => {
    expect(maskCpfForLog('123')).toBe('***')
  })

  it('deve ocultar completamente um valor vazio', () => {
    expect(maskCpfForLog('')).toBe('***')
  })
})

describe('isValidCpf', () => {
  it('deve aceitar um CPF válido sem formatação', () => {
    expect(isValidCpf('52998224725')).toBe(true)
  })

  it('deve aceitar um CPF válido formatado', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true)
  })

  it('deve rejeitar CPF com dígito verificador inválido', () => {
    expect(isValidCpf('52998224724')).toBe(false)
  })

  it('deve rejeitar CPF com todos os dígitos iguais', () => {
    expect(isValidCpf('11111111111')).toBe(false)
  })

  it('deve rejeitar CPF com quantidade incorreta de dígitos', () => {
    expect(isValidCpf('123456789')).toBe(false)
  })

  it('deve rejeitar valor vazio', () => {
    expect(isValidCpf('')).toBe(false)
  })
})
