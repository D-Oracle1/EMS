/**
 * Collapsible menu sections: how the resolved menu splits into sections, and
 * which of them start open.
 */
import { describe, it, expect } from 'vitest';
import { groupNav, isNavActive, isSectionOpen } from '@/lib/nav-sections';
import type { ResolvedNav } from '@/lib/navigation';

const item = (href: string) => ({ href, label: href, icon: () => null, color: 'blue' }) as unknown as ResolvedNav['items'][number];

const nav: ResolvedNav = {
  items: [item('/dashboard'), item('/customers'), item('/loans'), item('/loans/new'), item('/hr'), item('/hr/payroll')],
  headings: new Map([
    ['/loans', 'Lending'],
    ['/hr', 'People'],
  ]),
};

describe('groupNav', () => {
  it('keeps the entries above the first heading in an untitled group', () => {
    const groups = groupNav(nav);
    expect(groups.map((g) => g.heading)).toEqual([null, 'Lending', 'People']);
    expect(groups[0].items.map((i) => i.href)).toEqual(['/dashboard', '/customers']);
    expect(groups[1].items.map((i) => i.href)).toEqual(['/loans', '/loans/new']);
  });

  it('titles the first group when the menu opens on a heading', () => {
    const groups = groupNav({ items: [item('/hr')], headings: new Map([['/hr', 'People']]) });
    expect(groups).toHaveLength(1);
    expect(groups[0].heading).toBe('People');
  });
});

describe('isNavActive', () => {
  it('matches section landings exactly and everything else by prefix', () => {
    expect(isNavActive('/hr', '/hr/payroll')).toBe(false);
    expect(isNavActive('/dashboard', '/dashboard')).toBe(true);
    expect(isNavActive('/loans', '/loans/abc')).toBe(true);
    expect(isNavActive('/loans', '/loansx')).toBe(false);
  });
});

describe('isSectionOpen', () => {
  const [top, lending, people] = groupNav(nav);

  it('opens only the section holding the current page by default', () => {
    expect(isSectionOpen(lending, '/loans/abc', {})).toBe(true);
    expect(isSectionOpen(people, '/loans/abc', {})).toBe(false);
  });

  it('never folds the untitled top group', () => {
    expect(isSectionOpen(top, '/hr', { Lending: false })).toBe(true);
  });

  it('lets an explicit choice win either way', () => {
    expect(isSectionOpen(lending, '/loans', { Lending: false })).toBe(false);
    expect(isSectionOpen(people, '/loans', { People: true })).toBe(true);
  });
});
