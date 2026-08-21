import { AuthFinish } from '@/components/AuthFinish'

export const dynamic = 'force-dynamic'

/**
 * Where every sign-in link lands.
 *
 * Supabase's DEFAULT email template uses {{ .ConfirmationURL }}, and on the free
 * tier the template cannot be changed without custom SMTP. That URL returns the
 * session in one of two shapes depending on how the link was requested:
 *
 *   ?code=…            PKCE, when the browser client requested it and holds the
 *                      matching code verifier
 *   #access_token=…    implicit, in the URL FRAGMENT — which is never sent to
 *                      the server, so no server route can ever see it
 *
 * A server-only callback therefore appears to "work" and silently bounces the
 * user back to sign-in. This page runs in the browser, where both forms are
 * visible, and hands the resulting session to the cookie store the server reads.
 */
export default function AuthFinishPage() {
  return <AuthFinish />
}
