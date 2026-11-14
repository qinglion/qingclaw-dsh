import { expect, it } from 'vitest'
import { profile } from '../src/details.ts'

it.each([undefined, null, '', 'https://example.test/avatar.png'])('projects Platform picture %s', (picture) => {
  expect(profile({ id: 'user', email: 'masked@example.test', id_profile: { name: 'User', picture } }).avatarUrl)
    .toBe(picture || null)
})

it('projects missing display fields and empty contact values as null', () => {
  expect(profile({ email: '' })).toEqual({ id: null, avatarUrl: null, name: null, contact: null })
  expect(profile({ email: '', id_profile: { name: '' } }).name).toBeNull()
})

it('projects the QingClaw WeChat identity used by the shared account menu', () => {
  expect(profile({
    id: 'qcu_qingclaw_user',
    email: '微信账号',
    id_profile: {
      name: '青狮微信用户',
      picture: 'https://thirdwx.qlogo.cn/mmopen/avatar/132',
    },
  })).toEqual({
    id: 'qcu_qingclaw_user',
    name: '青狮微信用户',
    contact: '微信账号',
    avatarUrl: 'https://thirdwx.qlogo.cn/mmopen/avatar/132',
  })
})
