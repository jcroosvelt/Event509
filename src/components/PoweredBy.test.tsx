import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PoweredBy } from './PoweredBy';

describe('Powered by JC Multimedia', () => {
  it('le lien mène à jcmultimedia.online, dans un nouvel onglet, sans transmettre la page d’origine', () => {
    render(<PoweredBy />);
    const a = screen.getByRole('link', { name: 'JC Multimedia' });
    expect(a.getAttribute('href')).toBe('https://jcmultimedia.online');
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toContain('noopener');
    expect(screen.getByText(/Powered by/)).toBeTruthy();
  });
});
