import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Locale = 'ko' | 'en' | 'es';
export const LOCALES: Array<{ value: Locale; label: string }> = [
  { value: 'ko', label: '한국어' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
];
export const LOCALE_STORAGE_KEY = 'jongjong_web_locale';
const STORAGE_KEY = LOCALE_STORAGE_KEY;

const en: Record<string, string> = {
  '우리 방': 'Our Room', '함께 꾸민 방': 'The room you decorated together', '우리 방 준비 중…': 'Preparing Our Room…', '우리 반려동물 포함': 'Include our pets', '우리 방 미디어를 불러오지 못했어요. 다시 시도해 주세요.': 'Some Room media could not be loaded. Please retry.', '우리 방을 준비하지 못했어요. 다시 시도해 주세요.': 'Could not prepare Our Room. Please retry.',
  '배경 선택': 'Choose background',
  '배경 편집': 'Background editor', '색상': 'Color', '이미지': 'Image', '원본': 'Original',
  '닫기': 'Close', '이미지를 불러오는 중': 'Loading image', '이전': 'Previous', '다음': 'Next', '선택 해제': 'Deselect', '이 사진 선택': 'Select this photo',
  '프레임 너비': 'Frame width', '1칸': '1 cell', '2칸': '2 cells', '한 칸 안에 둘이 가까이 담기는 구도': 'A close composition within one cell', '두 칸을 사용해 넓게 포즈를 잡는 구도': 'A wide pose using two cells',
  'JONGJONG': 'JONGJONG', 'Couple Booth': 'Couple Booth', '로그인하고 둘만의 포토부스에 입장하세요.': 'Sign in and enter your private photo booth.', 'Apple로 계속하기': 'Continue with Apple', 'Apple로 연결 중...': 'Connecting to Apple...', 'Google로 계속하기': 'Continue with Google', 'Google로 연결 중...': 'Connecting to Google...', '또는 이메일로 계속하기': 'Or continue with email', '이메일': 'Email', '비밀번호': 'Password', '로그인': 'Sign in', '로그인 중...': 'Signing in...', '계정 만들기': 'Create account', '계정 만드는 중...': 'Creating account...', '처음이신가요?': 'New here?', '이미 계정이 있나요?': 'Already have an account?', '비밀번호 표시': 'Show password', '비밀번호 숨기기': 'Hide password', '가입 확인 메일을 확인하세요.': 'Check your email to confirm your account.', '이메일을 입력해 주세요.': 'Enter your email.', '올바른 이메일 형식을 입력해 주세요.': 'Enter a valid email address.', '비밀번호를 입력해 주세요.': 'Enter your password.', '비밀번호는 6자 이상이어야 합니다.': 'Your password must be at least 6 characters.',
  '설정': 'Settings', '나가기': 'Leave', '로그아웃': 'Sign out', '언어': 'Language', '홈': 'Home',
  '촬영 준비 중…': 'Preparing your booth…', '다시 시작': 'Start again', '다시 시도': 'Try again',
  '파트너 연결이 필요해요': 'Connect with your partner', '앱에서 파트너와 먼저 연결한 뒤, 같은 계정으로 웹에 로그인해 주세요.': 'Connect with your partner in the app, then sign in to the web with the same account.', '촬영 준비에 실패했어요': 'Could not prepare the booth',
  '새로운 초대': 'New invitation', '상대가 같이 사진을 찍고 싶어해요 💌': 'Your partner wants to take photos with you 💌',
  '촬영방이 준비되어 있어요': 'Your booth is ready', '방 들어가기': 'Enter booth', '방으로 돌아가기': 'Return to booth',
  '같이 사진 찍을까요? ♡': 'Take a photo together? ♡', '멀리 있어도,': 'Even when you are far apart,', '같은 순간을 함께 남겨요.': 'save the same moment together.',
  '방 만들기': 'Create booth', '방을 만드는 중…': 'Creating booth…', '방을 여는 중…': 'Opening booth…', '방을 만들면 상대에게 바로 초대돼요.': 'Your partner will be invited as soon as you create a booth.', '촬영방 상태를 불러오지 못했습니다.': 'Could not load the booth status.', '촬영방에 들어가지 못했습니다.': 'Could not enter the booth.', '촬영방을 만들지 못했습니다.': 'Could not create the booth.', '로그아웃하지 못했습니다.': 'Could not sign out.',
  '촬영실을 열 수 없어요': 'Could not open the booth', '참여할 수 없는 촬영실이에요': 'You cannot join this booth',
  '테스트 촬영 종료': 'Test session ended', '촬영실에서 나갔습니다. 이 창을 닫아도 됩니다.': 'You left the booth. You can close this window.', '테스트 촬영방': 'Test booth', '테스트 촬영방에 연결하는 중…': 'Connecting to the test booth…', '링크가 유효하지 않거나 이미 사용되었습니다.': 'This link is invalid or has already been used.',
  '상대를 기다리고 있어요': 'Waiting for your partner', '초대를 보냈어요. 상대가 들어오면 함께 촬영을 준비할 수 있어요.': 'The invitation is sent. You can prepare when your partner joins.', '화면을 맞춘 뒤 촬영을 눌러 주세요.': 'Set up your frame, then press capture.', '둘 다 준비되면 촬영을 시작해요.': 'The session starts when you are both ready.', '함께 들어왔어요': 'You are both here', '둘 다 준비되면 카메라가 열려요.': 'The camera opens when you are both ready.',
  '함께 촬영 중': 'Taking photos together', '함께 촬영 준비 완료': 'Ready to take photos together', '함께 연결됐어요': 'Connected together',
  '사진을 고르는 중': 'Choosing photos', '사진이 완성됐어요': 'Your photos are ready', '촬영이 종료됐어요': 'The session has ended',
  '촬영 화면': 'Frame', '양쪽 커플샷': 'Side-by-side couple', '세로 아이폰': 'Vertical iPhone', '사진 다시 불러오기': 'Reload photos', '새로 시작': 'Start fresh', '연결에 문제가 있어요': 'There is a connection problem', '장 중': 'of', '장 선택': 'photos selected', '두 사람이 함께 사진을 고르고, 둘 다 승인하면 최종본이 만들어져요.': 'Choose photos together; the final image is created when you both approve.', '최종 4컷 테두리에 적용돼요.': 'Applied to the final four-photo frame.', '최종 네컷 미리보기': 'Final four-photo preview', '사진 속 사람을 직접 움직여 구도를 맞춰보세요.': 'Move the people in the photo to adjust the composition.',
  '촬영 준비 상태': 'Capture readiness', '나': 'Me', '상대': 'Partner', '준비됐어요': 'Ready', '준비 전': 'Not ready', '카메라': 'Camera', '선택': 'Select', '마이크 켜짐': 'Mic on', '마이크 꺼짐': 'Mic off', '거울': 'Mirror', '배경·Same Space': 'Background · Same Space', '촬영': 'Capture', '촬영 시작': 'Start session',
  '내 자리': 'My side', '내가 왼쪽': 'I am left', '내가 오른쪽': 'I am right', '자리 바꾸기': 'Swap sides', '위치 초기화': 'Reset position', '배경': 'Background',
  '방으로 가져가기': 'Bring to Room', '방으로 가져갈 사진을 선택하세요': 'Choose a photo to bring to your Room', '선택한 원본 사진을 우선 추천해요. 최종 네컷은 직접 선택할 때만 사용돼요.': 'Selected original photos are recommended. The final strip is used only when you choose it.', '원본 사진': 'Original photo', '최종 네컷': 'Final strip', 'iPhone에서 준비됐어요': 'Ready on your iPhone', '보내는 중…': 'Sending…', '직접 선택': 'Choose final strip', '방으로 보내지 못했어요. 다시 시도해 주세요.': 'Could not send this to your Room. Please try again.', 'JONGJONG → Room → Cutout → From Booth를 열어 주세요.': 'Open JONGJONG → Room → Cutout → From Booth.',
  '리뷰': 'Review', '컬러 모드': 'Color mode', '컬러': 'Color', '흑백': 'Monochrome', '촬영한 사진': 'Captured photos', '선택 순서': 'Selection order', '최종 모습': 'Final look', '사진을 선택하세요': 'Select a photo', '구도 조정': 'Adjust composition', '확대': 'Zoom', '가로': 'Horizontal', '세로': 'Vertical', '배경 고르기': 'Choose background', '프레임': 'Frame', '선택 승인': 'Approve selection', '완성 중…': 'Finishing…', '다시 만들기': 'Try again', '최종본 만들기': 'Create final image', '호스트만으로 완료': 'Finish as host', '최종본': 'Final image', '완료됐어요.': 'Done.', '다운로드': 'Download', '공유': 'Share', 'JONGJONG에서 열기': 'Open in JONGJONG',
  '촬영방을 나갈까요? 현재 촬영 또는 저장 중인 결과가 완료되지 않을 수 있어요.': 'Leave the booth? The current capture or result may not be completed.', '촬영 시간이 얼마 남지 않았어요.': 'Your capture time is almost over.', '촬영 시간이 끝났습니다.': 'Capture time has ended.', '내 8장을 업로드했습니다. 상대의 업로드를 확인하는 중이에요.': 'My 8 photos are uploaded. Waiting for your partner’s upload.', '촬영 시간이 끝났습니다. 업로드가 완료된 컷만 검토할 수 있어요.': 'Capture time has ended. Only completed uploads can be reviewed.', '촬영 시간이 끝났습니다. 두 사람의 업로드가 모두 확인될 때만 Review로 이동합니다.': 'Capture time has ended. Review opens after both uploads are confirmed.',
};
const es: Record<string, string> = {
  '우리 방': 'Nuestra habitación', '함께 꾸민 방': 'La habitación que decoraron juntos', '우리 방 준비 중…': 'Preparando nuestra habitación…', '우리 반려동물 포함': 'Incluir nuestras mascotas', '우리 방 미디어를 불러오지 못했어요. 다시 시도해 주세요.': 'No se pudo cargar parte del contenido. Inténtalo de nuevo.', '우리 방을 준비하지 못했어요. 다시 시도해 주세요.': 'No se pudo preparar la habitación. Inténtalo de nuevo.',
  '배경 선택': 'Elegir fondo',
  '배경 편집': 'Editor de fondo', '색상': 'Color', '이미지': 'Imagen', '원본': 'Original',
  '닫기': 'Cerrar', '이미지를 불러오는 중': 'Cargando imagen', '이전': 'Anterior', '다음': 'Siguiente', '선택 해제': 'Quitar selección', '이 사진 선택': 'Seleccionar esta foto',
  '프레임 너비': 'Ancho del encuadre', '1칸': '1 celda', '2칸': '2 celdas', '한 칸 안에 둘이 가까이 담기는 구도': 'Composición cercana en una celda', '두 칸을 사용해 넓게 포즈를 잡는 구도': 'Posado amplio usando dos celdas',
  'JONGJONG': 'JONGJONG', 'Couple Booth': 'Couple Booth', '로그인하고 둘만의 포토부스에 입장하세요.': 'Inicia sesión y entra en tu cabina privada.', 'Apple로 계속하기': 'Continuar con Apple', 'Apple로 연결 중...': 'Conectando con Apple...', 'Google로 계속하기': 'Continuar con Google', 'Google로 연결 중...': 'Conectando con Google...', '또는 이메일로 계속하기': 'O continuar con email', '이메일': 'Email', '비밀번호': 'Contraseña', '로그인': 'Iniciar sesión', '로그인 중...': 'Iniciando sesión...', '계정 만들기': 'Crear cuenta', '계정 만드는 중...': 'Creando cuenta...', '처음이신가요?': '¿Es tu primera vez?', '이미 계정이 있나요?': '¿Ya tienes una cuenta?', '비밀번호 표시': 'Mostrar contraseña', '비밀번호 숨기기': 'Ocultar contraseña', '가입 확인 메일을 확인하세요.': 'Revisa tu email para confirmar la cuenta.', '이메일을 입력해 주세요.': 'Escribe tu email.', '올바른 이메일 형식을 입력해 주세요.': 'Escribe un email válido.', '비밀번호를 입력해 주세요.': 'Escribe tu contraseña.', '비밀번호는 6자 이상이어야 합니다.': 'La contraseña debe tener al menos 6 caracteres.',
  '설정': 'Configuración', '나가기': 'Salir', '로그아웃': 'Cerrar sesión', '언어': 'Idioma', '홈': 'Inicio', '촬영 준비 중…': 'Preparando tu cabina…', '다시 시작': 'Empezar de nuevo', '다시 시도': 'Reintentar',
  '파트너 연결이 필요해요': 'Conecta con tu pareja', '앱에서 파트너와 먼저 연결한 뒤, 같은 계정으로 웹에 로그인해 주세요.': 'Conecta con tu pareja en la app y luego inicia sesión con la misma cuenta.', '촬영 준비에 실패했어요': 'No se pudo preparar la cabina', '새로운 초대': 'Nueva invitación', '촬영방이 준비되어 있어요': 'Tu cabina está lista', '방 들어가기': 'Entrar a la cabina', '방 만들기': 'Crear cabina', '방을 만드는 중…': 'Creando cabina…', '방을 여는 중…': 'Abriendo cabina…', '방을 만들면 상대에게 바로 초대돼요.': 'Tu pareja recibirá una invitación al crear la cabina.', '촬영방 상태를 불러오지 못했습니다.': 'No se pudo cargar el estado.', '촬영방에 들어가지 못했습니다.': 'No se pudo entrar a la cabina.', '촬영방을 만들지 못했습니다.': 'No se pudo crear la cabina.', '로그아웃하지 못했습니다.': 'No se pudo cerrar sesión.',
  '촬영실을 열 수 없어요': 'No se pudo abrir la cabina', '참여할 수 없는 촬영실이에요': 'No puedes participar en esta cabina', '테스트 촬영 종료': 'Sesión de prueba terminada', '촬영실에서 나갔습니다. 이 창을 닫아도 됩니다.': 'Saliste de la cabina. Puedes cerrar esta ventana.', '테스트 촬영방': 'Cabina de prueba', '테스트 촬영방에 연결하는 중…': 'Conectando a la cabina de prueba…', '링크가 유효하지 않거나 이미 사용되었습니다.': 'El enlace no es válido o ya fue usado.',
  '상대를 기다리고 있어요': 'Esperando a tu pareja', '함께 들어왔어요': 'Ya están los dos', '둘 다 준비되면 카메라가 열려요.': 'La cámara se abrirá cuando ambos estén listos.', '함께 촬영 중': 'Tomando fotos juntos', '함께 촬영 준비 완료': 'Listos para tomar fotos', '함께 연결됐어요': 'Conectados', '사진을 고르는 중': 'Eligiendo fotos', '사진이 완성됐어요': 'Tus fotos están listas', '촬영이 종료됐어요': 'La sesión terminó',
  '촬영 화면': 'Encuadre', '양쪽 커플샷': 'Pareja lado a lado', '세로 아이폰': 'iPhone vertical', '사진 다시 불러오기': 'Recargar fotos', '새로 시작': 'Empezar de nuevo', '연결에 문제가 있어요': 'Hay un problema de conexión', '촬영 준비 상태': 'Estado de preparación', '나': 'Yo', '상대': 'Pareja', '준비됐어요': 'Listo', '준비 전': 'No listo', '카메라': 'Cámara', '선택': 'Seleccionar', '마이크 켜짐': 'Micrófono activado', '마이크 꺼짐': 'Micrófono desactivado', '거울': 'Espejo', '배경·Same Space': 'Fondo · Same Space', '촬영': 'Capturar', '촬영 시작': 'Iniciar sesión',
  '내 자리': 'Mi lado', '내가 왼쪽': 'Estoy a la izquierda', '내가 오른쪽': 'Estoy a la derecha', '자리 바꾸기': 'Cambiar lados', '위치 초기화': 'Restablecer posición', '배경': 'Fondo', '리뷰': 'Revisión', '컬러 모드': 'Modo de color', '컬러': 'Color', '흑백': 'Monocromo', '촬영한 사진': 'Fotos tomadas', '최종 모습': 'Resultado final', '사진을 선택하세요': 'Selecciona una foto', '구도 조정': 'Ajustar composición', '확대': 'Zoom', '가로': 'Horizontal', '세로': 'Vertical', '배경 고르기': 'Elegir fondo', '프레임': 'Marco', '선택 승인': 'Aprobar selección', '완성 중…': 'Finalizando…', '다시 만들기': 'Intentar de nuevo', '최종본 만들기': 'Crear imagen final', '최종본': 'Imagen final', '완료됐어요.': 'Listo.', '다운로드': 'Descargar', '공유': 'Compartir', 'JONGJONG에서 열기': 'Abrir en JONGJONG',
  '방으로 가져가기': 'Llevar a la habitación', '방으로 가져갈 사진을 선택하세요': 'Elige una foto para tu habitación', '선택한 원본 사진을 우선 추천해요. 최종 네컷은 직접 선택할 때만 사용돼요.': 'Recomendamos las fotos originales elegidas. La tira final solo se usa si la eliges.', '원본 사진': 'Foto original', '최종 네컷': 'Tira final', 'iPhone에서 준비됐어요': 'Listo en tu iPhone', '보내는 중…': 'Enviando…', '직접 선택': 'Elegir tira final', '방으로 보내지 못했어요. 다시 시도해 주세요.': 'No se pudo enviar a tu habitación. Inténtalo de nuevo.', 'JONGJONG → Room → Cutout → From Booth를 열어 주세요.': 'Abre JONGJONG → Room → Cutout → From Booth.',
  '촬영방을 나갈까요? 현재 촬영 또는 저장 중인 결과가 완료되지 않을 수 있어요.': '¿Salir de la cabina? La captura o el resultado actual podría no completarse.', '촬영 시간이 얼마 남지 않았어요.': 'Queda poco tiempo de captura.', '촬영 시간이 끝났습니다.': 'El tiempo de captura terminó.', '내 8장을 업로드했습니다. 상대의 업로드를 확인하는 중이에요.': 'Mis 8 fotos están subidas. Esperando las de tu pareja.', '촬영 시간이 끝났습니다. 업로드가 완료된 컷만 검토할 수 있어요.': 'Terminó el tiempo. Solo se pueden revisar fotos subidas.', '촬영 시간이 끝났습니다. 두 사람의 업로드가 모두 확인될 때만 Review로 이동합니다.': 'Terminó el tiempo. Revisión estará disponible cuando se confirmen ambas cargas.',
};
const resources: Record<Locale, Record<string, string>> = { ko: {}, en, es };

export const marketingCopy = {
  en: { explore: 'Explore', booth: 'Couple Booth', heroEyebrow: 'A little shared world for two', heroTitle: <>Your little world,<br />together.</>, heroLead: 'Share the little things. Build a room together. Leave letters, make plans, and stay close wherever you are.', see: 'See how it feels', introEyebrow: 'It’s not another chat app', introTitle: <>A place you both<br />keep coming back to.</>, introLead: 'Small moments, a room you arrange yourselves, and things that wait for the two of you.', momentsEyebrow: 'Shared everyday moments', momentsTitle: 'See each other’s day.', momentsLead: 'Share a photo or drawing, then let two separate moments become one shared memory.', momentNote: 'Photo / Draw · your local time, together', roomEyebrow: 'Our Room', roomTitle: 'Make the room yours.', roomLead: 'Move things around. Add your photos. Place your pets. Decorate a space that slowly becomes yours.', roomA: 'Place, move, and resize objects', roomB: 'Arrange photos, furniture, mail, and memories', roomC: 'Keep the pets you raise together close by', playEyebrow: 'Another room, just to play', playTitle: 'There’s always something to do.', playLead: 'Kuji, Truth or Dare, This or That, Roulette, and little surprises can live right in your shared Game Room.', playNote: 'Playful things, in a place you made together', drawBattle: 'Draw Battle · one word, two drawings', drawTogether: 'Draw Together · one shared canvas', galleryEyebrow: 'More little worlds', galleryTitle: 'More things, together.', galleryCue: 'Swipe to explore →', galleryShare: 'Send a little hello', galleryShareLead: 'Share a photo with your person in seconds.', galleryWidgets: 'A little closer, at a glance', galleryWidgetsLead: 'See each other on your lock screen.', galleryMemories: 'Memories', galleryMemoriesLead: 'Keep the days you want to revisit.', galleryMeet: 'When we meet', galleryMeetLead: 'Keep the next hello in sight.', galleryDraw: 'Draw together', galleryDrawLead: 'One shared canvas, or a tiny battle.', gallerySleep: 'Sleep together', gallerySleepLead: 'A quiet goodnight, wherever you are.', lettersEyebrow: 'Letters', lettersTitle: 'Some things deserve more than a text.', lettersLead: 'Write something slowly. Send it. Let it wait. Open it when it matters.', letterTypes: 'Special Letter · Handwritten · Confession · saved mail', distanceEyebrow: 'Plan around the distance', distanceTitle: 'Even when your days don’t line up.', distanceLead: 'Plan the next meeting, find a good time to call, save the important dates, and keep a few things ready for when you meet.', boothTitle: 'Take a photo together, even from far away.', boothLead: 'A tiny photo booth made for the two of you.', openBooth: 'Open Couple Booth', originEyebrow: 'How it started', originTitle: 'It started as an app I made to flirt with Jay.', originLead: 'Then we ended up dating, became long distance, and I kept adding the things we actually wanted to use together. Eventually, it became jongjong.', finalTitle: <>A little closer,<br />more often.</>, finalLead: 'A quiet place for the two of you, wherever today takes you.', footer: 'Your little world, together.', privacy: 'Privacy', terms: 'Terms', support: 'Support', download: 'Download jongjong on the App Store' },
  ko: { explore: '둘러보기', booth: '커플 부스', heroEyebrow: '둘만을 위한 작은 세계', heroTitle: <>우리만의 작은 세계,<br />함께.</>, heroLead: '작은 순간을 나누고, 방을 함께 꾸미고, 편지를 남겨요. 어디에 있든 더 가까이.', see: '어떤 곳인지 보기', introEyebrow: '또 하나의 채팅 앱이 아니에요', introTitle: <>자꾸 다시 찾게 되는<br />둘만의 공간.</>, introLead: '작은 순간들, 직접 꾸민 방, 그리고 서로를 기다리는 것들이 있어요.', momentsEyebrow: '매일의 작은 순간', momentsTitle: '서로의 하루를 봐요.', momentsLead: '사진이나 그림을 나누면, 떨어져 있던 두 순간이 하나의 추억이 돼요.', momentNote: '사진 / 그림 · 서로의 현지 시간', roomEyebrow: '우리 방', roomTitle: '방을 우리답게 꾸며요.', roomLead: '이리저리 옮기고, 사진을 더하고, 반려동물을 놓아 보세요. 천천히 우리만의 공간이 돼요.', roomA: '물건을 놓고, 옮기고, 크기를 바꿔요', roomB: '사진, 가구, 편지와 추억을 마음대로 배치해요', roomC: '함께 키우는 반려동물도 가까이에 둬요', playEyebrow: '놀기 위한 또 하나의 방', playTitle: '함께 할 건 늘 있어요.', playLead: '쿠지, 진실 혹은 도전, 밸런스 게임, 룰렛과 작은 놀이는 게임 방 안에 있어요.', playNote: '함께 만든 공간에서 즐기는 작은 놀이', drawBattle: '그림 대결 · 한 단어, 두 그림', drawTogether: '함께 그리기 · 하나의 캔버스', galleryEyebrow: '더 많은 작은 세계', galleryTitle: '함께 할 더 많은 것들.', galleryCue: '옆으로 넘겨 보기 →', galleryShare: '지금, 사진 한 장', galleryShareLead: '카메라로 찍어 바로 상대에게 보내요.', galleryWidgets: '한눈에 더 가까이', galleryWidgetsLead: '잠금 화면에서 서로의 순간을 봐요.', galleryMemories: '추억', galleryMemoriesLead: '다시 꺼내 보고 싶은 하루를 남겨요.', galleryMeet: '우리의 만남', galleryMeetLead: '다음 인사를 가까이에 두어요.', galleryDraw: '함께 그리기', galleryDrawLead: '하나의 캔버스, 또는 작은 대결.', gallerySleep: '함께 잠들기', gallerySleepLead: '어디에 있어도 조용한 굿나잇.', lettersEyebrow: '편지', lettersTitle: '어떤 말은 문자보다 편지가 어울려요.', lettersLead: '천천히 쓰고, 보내고, 기다렸다가, 가장 필요한 순간에 열어 봐요.', letterTypes: '스페셜 레터 · 손글씨 · 고백 · 보관한 편지', distanceEyebrow: '거리 사이의 약속', distanceTitle: '하루가 엇갈리는 날에도.', distanceLead: '다음 만남을 정하고, 통화하기 좋은 시간을 찾고, 중요한 날과 만나서 할 일을 함께 챙겨요.', boothTitle: '멀리 있어도 함께 사진을 찍어요.', boothLead: '오직 둘을 위한 작은 포토부스예요.', openBooth: '커플 부스 열기', originEyebrow: '시작은 이랬어요', originTitle: 'Jay에게 플러팅하려고 만든 앱이었어요.', originLead: '그러다 만나게 되고, 장거리를 하게 되고, 우리가 함께 쓰고 싶던 것들을 하나씩 더했어요. 그러다 jongjong이 되었어요.', finalTitle: <>조금 더 가까이,<br />더 자주.</>, finalLead: '오늘 어디에 있든, 둘만을 위한 조용한 공간.', footer: '우리만의 작은 세계, 함께.', privacy: '개인정보 처리방침', terms: '이용약관', support: '지원', download: 'App Store에서 jongjong 다운로드' },
  es: { explore: 'Explorar', booth: 'Cabina para dos', heroEyebrow: 'Un pequeño mundo para dos', heroTitle: <>Su pequeño mundo,<br />juntos.</>, heroLead: 'Compartan lo pequeño. Construyan una habitación. Dejen cartas, hagan planes y sigan cerca estén donde estén.', see: 'Descubre cómo se siente', introEyebrow: 'No es otra app de chat', introTitle: <>Un lugar al que los dos<br />quieren volver.</>, introLead: 'Momentos pequeños, una habitación que organizan a su manera y cosas que esperan a los dos.', momentsEyebrow: 'Momentos de cada día', momentsTitle: 'Miren el día del otro.', momentsLead: 'Comparte una foto o un dibujo y convierte dos momentos separados en un recuerdo compartido.', momentNote: 'Foto / Dibujo · su hora local, juntos', roomEyebrow: 'Nuestra habitación', roomTitle: 'Haz que la habitación sea suya.', roomLead: 'Muevan las cosas. Añadan fotos. Coloquen a sus mascotas. Decoren un espacio que poco a poco se vuelve suyo.', roomA: 'Coloquen, muevan y cambien el tamaño de los objetos', roomB: 'Organicen fotos, muebles, cartas y recuerdos', roomC: 'Tengan cerca a las mascotas que crían juntos', playEyebrow: 'Otra habitación, solo para jugar', playTitle: 'Siempre hay algo que hacer.', playLead: 'Kuji, Verdad o reto, Esto o aquello, Ruleta y pequeñas sorpresas viven en su Game Room.', playNote: 'Pequeños juegos en un espacio creado por ustedes', drawBattle: 'Duelo de dibujo · una palabra, dos dibujos', drawTogether: 'Dibujen juntos · un lienzo compartido', galleryEyebrow: 'Más pequeños mundos', galleryTitle: 'Más cosas, juntos.', galleryCue: 'Desliza para descubrir →', galleryShare: 'Un pequeño hola', galleryShareLead: 'Envía una foto a tu persona en segundos.', galleryWidgets: 'Más cerca, de un vistazo', galleryWidgetsLead: 'Mírense en la pantalla bloqueada.', galleryMemories: 'Recuerdos', galleryMemoriesLead: 'Guarden los días que quieren volver a ver.', galleryMeet: 'Cuando se vean', galleryMeetLead: 'Tengan cerca el próximo hola.', galleryDraw: 'Dibujen juntos', galleryDrawLead: 'Un lienzo compartido o un pequeño duelo.', gallerySleep: 'Duerman juntos', gallerySleepLead: 'Un buenas noches tranquilo, estén donde estén.', lettersEyebrow: 'Cartas', lettersTitle: 'Hay cosas que merecen más que un mensaje.', lettersLead: 'Escriban sin prisa. Envíen. Esperen. Ábranlas cuando importe.', letterTypes: 'Carta especial · A mano · Confesión · correo guardado', distanceEyebrow: 'Planes a pesar de la distancia', distanceTitle: 'Aunque sus días no coincidan.', distanceLead: 'Planeen el próximo encuentro, encuentren un buen momento para llamar, guarden fechas importantes y planes para cuando se vean.', boothTitle: 'Tómense una foto juntos, incluso desde lejos.', boothLead: 'Una pequeña cabina de fotos para los dos.', openBooth: 'Abrir la cabina', originEyebrow: 'Cómo empezó', originTitle: 'Empezó como una app que hice para coquetear con Jay.', originLead: 'Luego empezamos a salir, tuvimos una relación a distancia y fui añadiendo lo que de verdad queríamos usar juntos. Así nació jongjong.', finalTitle: <>Un poco más cerca,<br />más a menudo.</>, finalLead: 'Un lugar tranquilo para los dos, dondequiera que los lleve el día.', footer: 'Su pequeño mundo, juntos.', privacy: 'Privacidad', terms: 'Términos', support: 'Soporte', download: 'Descargar jongjong en App Store' },
} as const;

export const widgetCopy = {
  en: {
    eyebrow: 'Home Screen Widgets',
    title: 'Keep their day close.',
    lead: 'Photos and drawings you share through Our Moment can live right on your Home Screen — so you can see a little piece of each other’s day without opening the app.',
    photosAndDrawings: 'Photos & drawings',
    sizes: 'Small & large widgets',
    imageAlt: 'jongjong Home Screen widgets showing a shared drawing and photo',
  },
  ko: {
    eyebrow: '홈 화면 위젯',
    title: '서로의 하루를 더 가까이.',
    lead: 'Our Moment에서 나눈 사진과 그림을 홈 화면에서 바로 만나보세요. 앱을 열지 않아도 서로의 하루 한 조각을 곁에 둘 수 있어요.',
    photosAndDrawings: '사진과 그림',
    sizes: '작은 · 큰 위젯',
    imageAlt: '공유한 그림과 사진을 보여 주는 jongjong 홈 화면 위젯',
  },
  es: {
    eyebrow: 'Widgets de inicio',
    title: 'Ten su día un poquito más cerca.',
    lead: 'Las fotos y dibujos que comparten en Our Moment pueden aparecer directamente en tu pantalla de inicio, para que tengas un pedacito de su día contigo sin abrir la app.',
    photosAndDrawings: 'Fotos y dibujos',
    sizes: 'Widgets pequeños y grandes',
    imageAlt: 'widgets de inicio de jongjong con un dibujo y una foto compartidos',
  },
} as const;

export const redesignCopy = {
  en: {
    everydayEyebrow: 'Your everyday, together',
    everydayTitle: 'A place you both keep coming back to.',
    everydayLead: 'Send a little glimpse of your day. It is there whenever the other person looks.',
    momentEyebrow: 'Our Moment',
    momentTitle: 'Still there, even when you’re apart.',
    momentLead: 'A photo, a drawing, a quiet hello — shared once, then kept close all day.',
    worldEyebrow: 'Our little world',
    worldTitle: 'Make a little world that feels like yours.',
    worldLead: 'Decorate your shared Room with photos, objects, notes, and the little pieces of your relationship.',
    moreEyebrow: 'Little ways to stay close',
    moreTitle: 'More ways to feel close.',
    letters: 'Letters', lettersLead: 'Leave something for them to find.',
    dates: 'Our Date', datesLead: 'Keep the things you want to do together.',
    games: 'Games', gamesLead: 'A little spark when conversation needs one.',
    memories: 'Memories', memoriesLead: 'Keep the moments you made together.',
  },
  ko: {
    everydayEyebrow: '매일을 함께',
    everydayTitle: '둘 다 자꾸 다시 찾게 되는 곳.',
    everydayLead: '하루의 작은 장면을 보내 보세요. 상대가 볼 때마다 그곳에 그대로 있어요.',
    momentEyebrow: 'Our Moment',
    momentTitle: '멀리 있어도, 곁에 남아 있어요.',
    momentLead: '사진 한 장, 그림 한 장, 조용한 인사 한마디. 한 번 나누면 하루 내내 곁에 있어요.',
    worldEyebrow: '우리만의 작은 세계',
    worldTitle: '우리다운 작은 세계를 만들어요.',
    worldLead: '사진과 물건, 메모, 그리고 우리 관계의 작은 조각들로 함께 쓰는 방을 꾸며 보세요.',
    moreEyebrow: '더 가까워지는 작은 방법',
    moreTitle: '더 가까워지는 방법들.',
    letters: '편지', lettersLead: '상대가 발견할 작은 마음을 남겨요.',
    dates: '우리의 약속', datesLead: '함께 하고 싶은 일을 잊지 않게 담아 둬요.',
    games: '게임', gamesLead: '대화에 작은 불꽃이 필요할 때.',
    memories: '추억', memoriesLead: '함께 만든 순간을 오래 간직해요.',
  },
  es: {
    everydayEyebrow: 'Su día a día, juntos',
    everydayTitle: 'Un lugar al que los dos quieren volver.',
    everydayLead: 'Comparte un pequeño vistazo de tu día. Ahí estará cuando la otra persona quiera verlo.',
    momentEyebrow: 'Our Moment',
    momentTitle: 'Sigue ahí, incluso cuando están lejos.',
    momentLead: 'Una foto, un dibujo, un hola tranquilo: lo comparten una vez y lo llevan cerca todo el día.',
    worldEyebrow: 'Su pequeño mundo',
    worldTitle: 'Hagan un pequeño mundo que se sienta suyo.',
    worldLead: 'Decoren su habitación compartida con fotos, objetos, notas y esos pequeños pedazos de su relación.',
    moreEyebrow: 'Pequeñas formas de estar cerca',
    moreTitle: 'Más formas de sentirse cerca.',
    letters: 'Cartas', lettersLead: 'Déjale algo para encontrar.',
    dates: 'Sus planes', datesLead: 'Guarden lo que quieren hacer juntos.',
    games: 'Juegos', gamesLead: 'Un pequeño impulso cuando la conversación lo necesita.',
    memories: 'Recuerdos', memoriesLead: 'Guarden los momentos que hicieron juntos.',
  },
} as const;

function detectLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'ko' || saved === 'en' || saved === 'es') return saved;
    const browser = navigator.language.toLowerCase();
    return browser.startsWith('ko') ? 'ko' : browser.startsWith('es') ? 'es' : 'en';
  } catch { return 'en'; }
}

type I18nContextValue = { locale: Locale; setLocale: (locale: Locale) => void; t: (source: string) => string };
const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectLocale);
  const setLocale = (next: Locale) => {
    setLocaleState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* optional */ }
  };
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  const value = useMemo(() => ({ locale, setLocale, t: (source: string) => resources[locale][source] ?? source }), [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used within I18nProvider');
  return value;
}
