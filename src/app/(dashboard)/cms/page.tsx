import { redirect } from 'next/navigation';

/**
 * The sidebar links straight to the sub-pages, but /cms is the address people
 * type and the one the landing resolver is closest to. Send it to the content
 * editor rather than letting it 404.
 */
export default function CmsIndexPage() {
  redirect('/cms/content');
}
