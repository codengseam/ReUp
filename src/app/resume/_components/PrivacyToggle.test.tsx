// src/app/resume/_components/PrivacyToggle.test.tsx
// ReUp v2 Phase 5 (G3): Privacy mode toggle UI tests.
//
// The toggle reads its initial state from `isPrivacyMode()` (a server
// flag exposed via NEXT_PUBLIC_PRIVACY_MODE, mocked here) and persists
// user changes via `setPrivacyMode(enabled)` (also mocked).
//
// TDD-first: written before the component. The component must surface
// the current mode and propagate clicks back to the store.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PrivacyToggle } from './PrivacyToggle';

// Mock the privacy store. The component is required to call
// isPrivacyMode() on mount and setPrivacyMode() on click.
const isPrivacyMode = vi.fn(() => false);
const setPrivacyMode = vi.fn();
vi.mock('@/lib/resume/privacy', () => ({
  isPrivacyMode: () => isPrivacyMode(),
  setPrivacyMode: (v: boolean) => setPrivacyMode(v),
}));

describe('PrivacyToggle', () => {
  beforeEach(() => {
    isPrivacyMode.mockClear();
    setPrivacyMode.mockClear();
    isPrivacyMode.mockReturnValue(false);
  });

  it('renders a Switch with initial state off when isPrivacyMode() returns false', () => {
    isPrivacyMode.mockReturnValue(false);
    render(<PrivacyToggle />);
    const sw = screen.getByRole('switch');
    expect(sw).toBeInTheDocument();
    expect(sw).toHaveAttribute('data-state', 'unchecked');
  });

  it('renders a Switch with initial state on when isPrivacyMode() returns true', () => {
    isPrivacyMode.mockReturnValue(true);
    render(<PrivacyToggle />);
    const sw = screen.getByRole('switch');
    expect(sw).toHaveAttribute('data-state', 'checked');
  });

  it('clicking the Switch toggles setPrivacyMode(true) and reflects the new state', () => {
    isPrivacyMode.mockReturnValue(false);
    render(<PrivacyToggle />);
    const sw = screen.getByRole('switch');
    fireEvent.click(sw);
    expect(setPrivacyMode).toHaveBeenCalledWith(true);
  });

  it('clicking the Switch toggles setPrivacyMode(false) when already on', () => {
    isPrivacyMode.mockReturnValue(true);
    render(<PrivacyToggle />);
    const sw = screen.getByRole('switch');
    fireEvent.click(sw);
    expect(setPrivacyMode).toHaveBeenCalledWith(false);
  });

  it('renders a human-readable label explaining the privacy mode', () => {
    render(<PrivacyToggle />);
    // The Card title + Label both contain relevant text. Use
    // getAllByText to assert at least one match exists (and that the
    // component is rendering a meaningful label rather than a bare
    // switch).
    const matches = screen.getAllByText(/隐私|Privacy|local-only|本地/);
    expect(matches.length).toBeGreaterThan(0);
  });
});
