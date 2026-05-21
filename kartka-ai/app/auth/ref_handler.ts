// Utility: save referral code from URL to localStorage
// Include this in auth page
export function saveReferralCode() {
  if (typeof window === 'undefined') return
  const params = new URLSearchParams(window.location.search)
  const ref = params.get('ref')
  if (ref) localStorage.setItem('referral_code', ref.toUpperCase())
}

export function getReferralCode(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('referral_code')
}

export function clearReferralCode() {
  if (typeof window === 'undefined') return
  localStorage.removeItem('referral_code')
}
