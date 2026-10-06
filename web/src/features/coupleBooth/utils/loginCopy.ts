/** Korean copy for Couple Booth login (web has no i18n layer). */
export const LOGIN_COPY = {
  brand: 'JONGJONG',
  title: 'Couple Booth',
  description: '로그인하고 둘만의 포토부스에 입장하세요.',
  apple: 'Apple로 계속하기',
  appleLoading: 'Apple로 연결 중...',
  google: 'Google로 계속하기',
  googleLoading: 'Google로 연결 중...',
  divider: '또는 이메일로 계속하기',
  email: '이메일',
  password: '비밀번호',
  signIn: '로그인',
  signInLoading: '로그인 중...',
  signUp: '계정 만들기',
  signUpLoading: '계정 만드는 중...',
  createAccountPrompt: '처음이신가요?',
  createAccountAction: '계정 만들기',
  backToSignInPrompt: '이미 계정이 있나요?',
  backToSignInAction: '로그인',
  showPassword: '비밀번호 표시',
  hidePassword: '비밀번호 숨기기',
  signupSuccess: '가입 확인 메일을 확인하세요.',
  emailRequired: '이메일을 입력해 주세요.',
  emailInvalid: '올바른 이메일 형식을 입력해 주세요.',
  passwordRequired: '비밀번호를 입력해 주세요.',
  passwordTooShort: '비밀번호는 6자 이상이어야 합니다.',
} as const;

export type LoginFormMode = 'signin' | 'signup';

export type LoginBusyMethod = 'idle' | 'email' | 'apple' | 'google';

/** Auth methods exposed on the login screen (magic link intentionally omitted). */
export const LOGIN_AUTH_METHODS = ['apple', 'google', 'email'] as const;
