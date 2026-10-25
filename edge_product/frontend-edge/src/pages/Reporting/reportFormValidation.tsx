import type { MutableRefObject } from 'react';
import { AlertTriangle } from 'lucide-react';

export type FormFieldElement = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
export type FormFieldErrors = Record<string, string>;
export type FormFieldRefs = MutableRefObject<Record<string, FormFieldElement | null>>;

export const createSetFieldRef =
  (fieldRefs: FormFieldRefs) =>
  (fieldName: string) =>
  (element: FormFieldElement | null) => {
    fieldRefs.current[fieldName] = element;
  };

export const getValidationInputClassName = (
  fieldErrors: FormFieldErrors,
  fieldName: string,
  baseClass = ''
) => {
  const hasError = Boolean(fieldErrors[fieldName]);
  const baseInputClass = 'w-full px-3 py-2 border rounded-lg focus:ring-2 transition-all duration-200';
  const normalClass = 'border-gray-300 focus:ring-blue-500';
  const errorClass = 'border-red-500 bg-red-50 ring-2 ring-red-200 focus:border-red-500 focus:ring-red-500';

  return `${baseInputClass} ${hasError ? errorClass : normalClass} ${baseClass}`.trim();
};

export const renderValidationFieldError = (fieldErrors: FormFieldErrors, fieldName: string) => {
  if (!fieldErrors[fieldName]) {
    return null;
  }

  return (
    <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
      <AlertTriangle className="h-3 w-3" />
      {fieldErrors[fieldName]}
    </p>
  );
};

export const focusFirstValidationError = (fieldRefs: FormFieldRefs, fieldErrors: FormFieldErrors) => {
  const firstFieldName = Object.keys(fieldErrors).find((fieldName) => fieldRefs.current[fieldName]);
  const fieldRef = firstFieldName ? fieldRefs.current[firstFieldName] : null;

  if (!fieldRef) {
    return;
  }

  fieldRef.focus({ preventScroll: true });
  fieldRef.scrollIntoView({
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    block: 'center',
  });
};

type MessageFieldMapper = (message: string) => string | null;

export const extractBackendFieldErrors = (
  error: unknown,
  fieldNameMap: Record<string, string>,
  mapValidationMessageToField?: MessageFieldMapper
): FormFieldErrors => {
  const apiError = error as any;
  const nextFieldErrors: FormFieldErrors = {};
  const validationErrors = apiError?.response?.data?.validationErrors;

  if (validationErrors && typeof validationErrors === 'object') {
    Object.entries(validationErrors).forEach(([field, messages]) => {
      const frontendField = fieldNameMap[field] || `${field.charAt(0).toLowerCase()}${field.slice(1)}`;
      const firstMessage = Array.isArray(messages)
        ? messages.find((message) => typeof message === 'string')
        : typeof messages === 'string'
          ? messages
          : undefined;

      if (frontendField && firstMessage && !nextFieldErrors[frontendField]) {
        nextFieldErrors[frontendField] = firstMessage;
      }
    });
  }

  if (Object.keys(nextFieldErrors).length > 0) {
    return nextFieldErrors;
  }

  const message = typeof apiError?.message === 'string' ? apiError.message : '';
  if (!message.includes('Validation failed')) {
    return nextFieldErrors;
  }

  message
    .split('\n')
    .map((line: string) => line.replace(/^[•*-]\s*/, '').trim())
    .filter(Boolean)
    .forEach((line: string) => {
      const mappedField = mapValidationMessageToField?.(line);
      if (mappedField && !nextFieldErrors[mappedField]) {
        nextFieldErrors[mappedField] = line;
      }
    });

  return nextFieldErrors;
};
