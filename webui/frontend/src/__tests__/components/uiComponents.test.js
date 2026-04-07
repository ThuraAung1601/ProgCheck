/**
 * Tests for small UI primitives:
 *   Button, Toggle, Avatar, Card, InputField
 *
 * Requirements traced:
 *   SNFR-6  accessible via modern web browser
 *   SNFR-1  easy to use UI
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

import Button    from '../../components/Button';
import Toggle    from '../../components/Toggle';
import Avatar    from '../../components/Avatar';
import Card      from '../../components/Card';
import InputField from '../../components/InputField';

// ── Button ────────────────────────────────────────────────────────────────────

describe('Button', () => {
  test('renders children text', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  test('calls onClick when clicked', () => {
    const onClick = jest.fn();
    render(<Button onClick={onClick}>Go</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test('is disabled when disabled prop is true', () => {
    render(<Button disabled>No</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  test('applies secondary variant without crashing', () => {
    render(<Button variant="secondary">Sec</Button>);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  test('applies danger variant without crashing', () => {
    render(<Button variant="danger">Del</Button>);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  test('applies sm size without crashing', () => {
    render(<Button size="sm">Small</Button>);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  test('applies lg size without crashing', () => {
    render(<Button size="lg">Large</Button>);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });
});

// ── Toggle ────────────────────────────────────────────────────────────────────

describe('Toggle', () => {
  test('renders without crashing', () => {
    const { container } = render(<Toggle value={false} onChange={jest.fn()} />);
    expect(container.firstChild).toBeTruthy();
  });

  test('calls onChange(!value) when clicked (false → true)', () => {
    const onChange = jest.fn();
    const { container } = render(<Toggle value={false} onChange={onChange} />);
    fireEvent.click(container.firstChild);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  test('calls onChange(!value) when clicked (true → false)', () => {
    const onChange = jest.fn();
    const { container } = render(<Toggle value={true} onChange={onChange} />);
    fireEvent.click(container.firstChild);
    expect(onChange).toHaveBeenCalledWith(false);
  });
});

// ── Avatar ────────────────────────────────────────────────────────────────────

describe('Avatar', () => {
  test('renders initials from name', () => {
    const { container } = render(<Avatar name="Alice Bob" size={36} role="student" />);
    expect(container.textContent).toContain('AB');
  });

  test('renders ? when name is empty', () => {
    const { container } = render(<Avatar name="" size={36} role="student" />);
    expect(container.textContent).toContain('?');
  });

  test('renders img element when img prop provided', () => {
    render(<Avatar name="Alice" img="http://example.com/pic.png" />);
    expect(document.querySelector('img')).toBeTruthy();
  });

  test('calls onClick when clicked', () => {
    const onClick = jest.fn();
    const { container } = render(<Avatar name="Alice" onClick={onClick} />);
    fireEvent.click(container.firstChild);
    expect(onClick).toHaveBeenCalled();
  });

  test('teacher role renders without crashing', () => {
    const { container } = render(<Avatar name="Prof Jones" role="teacher" />);
    expect(container.firstChild).toBeTruthy();
  });
});

// ── Card ──────────────────────────────────────────────────────────────────────

describe('Card', () => {
  test('renders children', () => {
    render(<Card>Hello Card</Card>);
    expect(screen.getByText('Hello Card')).toBeInTheDocument();
  });

  test('applies custom className', () => {
    const { container } = render(<Card className="my-card">X</Card>);
    expect(container.firstChild.classList.contains('my-card')).toBe(true);
  });

  test('merges custom style', () => {
    const { container } = render(<Card style={{ padding: 8 }}>X</Card>);
    expect(container.firstChild.style.padding).toBe('8px');
  });
});

// ── InputField ────────────────────────────────────────────────────────────────

describe('InputField', () => {
  test('renders label text', () => {
    render(<InputField label="Username" value="" onChange={jest.fn()} />);
    expect(screen.getByText('Username')).toBeInTheDocument();
  });

  test('generates id field-<label>', () => {
    render(<InputField label="Username" value="" onChange={jest.fn()} />);
    expect(document.getElementById('field-username')).toBeTruthy();
  });

  test('calls onChange with new value when typed', () => {
    const onChange = jest.fn();
    render(<InputField label="Email" value="" onChange={onChange} />);
    fireEvent.change(document.getElementById('field-email'), { target: { value: 'a@b.com' } });
    expect(onChange).toHaveBeenCalledWith('a@b.com');
  });

  test('renders hint text when provided', () => {
    render(<InputField label="Name" value="" onChange={jest.fn()} hint="Enter full name" />);
    expect(screen.getByText('Enter full name')).toBeInTheDocument();
  });

  test('renders badge when provided', () => {
    render(<InputField label="Code" value="" onChange={jest.fn()} badge="REQUIRED" />);
    expect(screen.getByText('REQUIRED')).toBeInTheDocument();
  });

  test('input is readOnly when readOnly prop set', () => {
    render(<InputField label="ID" value="STU001" onChange={jest.fn()} readOnly />);
    expect(document.getElementById('field-id').readOnly).toBe(true);
  });

  test('renders type=password correctly', () => {
    render(<InputField label="Password" value="" onChange={jest.fn()} type="password" />);
    expect(document.getElementById('field-password').type).toBe('password');
  });
});
