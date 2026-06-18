import { useState, useCallback } from 'react';
import { handleGlobalError, retryWithBackoff } from '../utils/errorHandler';
import { addBreadcrumb } from '../lib/errorReporting';
import type { ErrorDetails } from '../types/error';

export function useErrorHandler(context = 'Component') {
  const [error, setError] = useState<ErrorDetails | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const handleError = useCallback((err: unknown, additionalContext: Record<string, unknown> = {}) => {
    const errorDetails = handleGlobalError(err, context, additionalContext);
    setError(errorDetails);
    return errorDetails;
  }, [context]);

  const clearError = useCallback(() => {
    setError(null);
    setRetryCount(0);
  }, []);

  const retryOperation = useCallback(async <T>(
    operation: () => Promise<T>,
    maxAttempts = 3
  ): Promise<T> => {
    if (!operation) throw new Error('No operation provided');

    setIsRetrying(true);

    try {
      const result = await retryWithBackoff(operation, maxAttempts, context);
      clearError();
      addBreadcrumb(`Retry successful in ${context}`, 'success');
      return result;
    } catch (retryError) {
      handleError(retryError, {
        isRetry: true,
        originalError: error?.originalError,
      });
      setRetryCount((prev) => prev + 1);
      throw retryError;
    } finally {
      setIsRetrying(false);
    }
  }, [context, error, handleError, clearError]);

  const withErrorHandling = useCallback(<Args extends unknown[], T>(
    asyncOperation: (...args: Args) => Promise<T>
  ) => {
    return async (...args: Args): Promise<T> => {
      try {
        clearError();
        const result = await asyncOperation(...args);
        addBreadcrumb(`Operation successful in ${context}`, 'info');
        return result;
      } catch (err) {
        handleError(err);
        throw err;
      }
    };
  }, [context, handleError, clearError]);

  return {
    error,
    isRetrying,
    retryCount,
    handleError,
    clearError,
    retryOperation,
    withErrorHandling,
    hasError: !!error,
  };
}

export function useAsyncOperation<T, Args extends unknown[]>(
  operation: (...args: Args) => Promise<T>,
  dependencies: unknown[] = []
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const { error, handleError, clearError, retryOperation } = useErrorHandler('AsyncOperation');

  const execute = useCallback(async (...args: Args) => {
    setLoading(true);
    clearError();

    try {
      const result = await operation(...args);
      setData(result);
      return result;
    } catch (err) {
      handleError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [operation, handleError, clearError, ...dependencies]);

  const retry = useCallback(async (...args: Args) => {
    return retryOperation(() => execute(...args));
  }, [retryOperation, execute]);

  return {
    data,
    loading,
    error,
    execute,
    retry,
    clearError,
  };
}

export interface ValidationRule {
  required?: boolean | string;
  pattern?: RegExp;
  patternMessage?: string;
  minLength?: number;
  maxLength?: number;
  custom?: (value: unknown, values: Record<string, unknown>) => string | null | undefined;
}

export function useFormValidation(validationRules: Record<string, ValidationRule> = {}) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const { handleError } = useErrorHandler('FormValidation');

  const validate = useCallback((values: Record<string, unknown>) => {
    const newErrors: Record<string, string> = {};

    Object.keys(validationRules).forEach((field) => {
      const rules = validationRules[field];
      const value = values[field];

      if (rules.required && (!value || value.toString().trim() === '')) {
        newErrors[field] = rules.required === true ? 'This field is required' : String(rules.required);
      } else if (value && rules.pattern && !rules.pattern.test(String(value))) {
        newErrors[field] = rules.patternMessage || 'Invalid format';
      } else if (value && rules.minLength && String(value).length < rules.minLength) {
        newErrors[field] = `Minimum length is ${rules.minLength}`;
      } else if (value && rules.maxLength && String(value).length > rules.maxLength) {
        newErrors[field] = `Maximum length is ${rules.maxLength}`;
      } else if (rules.custom) {
        try {
          const customError = rules.custom(value, values);
          if (customError) {
            newErrors[field] = customError;
          }
        } catch (err) {
          handleError(err, { field, value });
          newErrors[field] = 'Validation error occurred';
        }
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [validationRules, handleError]);

  const setFieldTouched = useCallback((field: string, isTouched = true) => {
    setTouched((prev) => ({ ...prev, [field]: isTouched }));
  }, []);

  const setFieldError = useCallback((field: string, fieldError: string) => {
    setErrors((prev) => ({ ...prev, [field]: fieldError }));
  }, []);

  const clearFieldError = useCallback((field: string) => {
    setErrors((prev) => {
      const newErrors = { ...prev };
      delete newErrors[field];
      return newErrors;
    });
  }, []);

  const clearAllErrors = useCallback(() => {
    setErrors({});
    setTouched({});
  }, []);

  const getFieldError = useCallback((field: string) => {
    return touched[field] ? errors[field] : null;
  }, [errors, touched]);

  return {
    errors,
    touched,
    validate,
    setFieldTouched,
    setFieldError,
    clearFieldError,
    clearAllErrors,
    getFieldError,
    hasErrors: Object.keys(errors).length > 0,
    hasFieldError: (field: string) => !!getFieldError(field),
  };
}
