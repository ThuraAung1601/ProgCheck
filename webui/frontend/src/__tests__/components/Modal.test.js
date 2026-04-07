/**
 * Jest tests for src/components/Modal.js
 *
 * Requirements traced:
 *   SNFR-6  system accessible via modern web browser
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import Modal from '../../components/Modal';

describe('Modal', () => {
  test('renders nothing when open=false', () => {
    const { container } = render(
      <Modal open={false} title="Test" onClose={jest.fn()}>body</Modal>
    );
    expect(container.firstChild).toBeNull();
  });

  test('renders title when open=true', () => {
    render(<Modal open={true} title="Hello Modal" onClose={jest.fn()}>content</Modal>);
    expect(screen.getByText('Hello Modal')).toBeInTheDocument();
  });

  test('renders children when open', () => {
    render(<Modal open={true} title="T" onClose={jest.fn()}><span>Child text</span></Modal>);
    expect(screen.getByText('Child text')).toBeInTheDocument();
  });

  test('renders actions when provided', () => {
    const actions = <button>OK</button>;
    render(<Modal open={true} title="T" onClose={jest.fn()} actions={actions}>c</Modal>);
    expect(screen.getByText('OK')).toBeInTheDocument();
  });

  test('applies wide class when wide=true', () => {
    const { container } = render(
      <Modal open={true} title="T" onClose={jest.fn()} wide={true}>c</Modal>
    );
    expect(container.querySelector('[class*="w-[760px]"]')).toBeInTheDocument();
  });

  test('does not apply wide class when wide=false (default)', () => {
    const { container } = render(
      <Modal open={true} title="T" onClose={jest.fn()}>c</Modal>
    );
    expect(container.querySelector('[class*="w-[320px]"]')).toBeInTheDocument();
  });
});
