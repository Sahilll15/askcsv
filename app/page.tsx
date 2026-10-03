import ClientApp from './ClientApp';
import { PrivacyNote, WelcomeIntro } from './components/WelcomeIntro';

export default function Page() {
  return <ClientApp intro={<WelcomeIntro />} note={<PrivacyNote />} />;
}
