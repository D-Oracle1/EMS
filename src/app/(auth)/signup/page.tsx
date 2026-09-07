import type { Metadata } from 'next';
import { SignupForm } from './signup-form';

export const metadata: Metadata = {
  title: 'Open an account — HY-LINK Finance Limited',
  description:
    'Tell us how to reach you and an account officer will get your account opened.',
};

export default function SignupPage() {
  return <SignupForm />;
}
