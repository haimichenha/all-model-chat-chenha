import { useState, useCallback, useEffect, useRef } from 'react';
import { logService } from '../utils/appUtils';

interface TextSelection {
  text: string;
  position: { x: number; y: number };
  element: HTMLElement;
}

interface UseContextualExplanationOptions {
  minTextLength?: number;
  enabledElements?: string[]; // CSS selectors for elements where contextual explanation is enabled
}

export const useContextualExplanation = (options: UseContextualExplanationOptions = {}) => {
  const {
    minTextLength = 10,
    enabledElements = ['.message-content', '.chat-message'] // Default selectors
  } = options;

  const [selectedText, setSelectedText] = useState<string>('');
  const [popupPosition, setPopupPosition] = useState<{ x: number; y: number } | null>(null);
  const [isPopupOpen, setIsPopupOpen] = useState<boolean>(false);
  const contextMenuTimeoutRef = useRef<NodeJS.Timeout>();

  const handleTextSelection = useCallback((event: MouseEvent) => {
    // Clear any existing timeout
    if (contextMenuTimeoutRef.current) {
      clearTimeout(contextMenuTimeoutRef.current);
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      setIsPopupOpen(false);
      return;
    }

    const range = selection.getRangeAt(0);
    const text = selection.toString().trim();

    // Check if the selected text meets our criteria
    if (text.length < minTextLength) {
      setIsPopupOpen(false);
      return;
    }

    // Check if the selection is within an enabled element
    const container = range.commonAncestorContainer;
    const element = container.nodeType === Node.TEXT_NODE 
      ? container.parentElement 
      : container as HTMLElement;

    if (!element) {
      setIsPopupOpen(false);
      return;
    }

    // Check if the element or any of its parents match our enabled selectors
    const isInEnabledElement = enabledElements.some(selector => {
      try {
        return element.closest(selector) !== null;
      } catch (e) {
        logService.warn('Invalid CSS selector:', selector);
        return false;
      }
    });

    if (!isInEnabledElement) {
      setIsPopupOpen(false);
      return;
    }

    // Calculate position for the popup
    const rect = range.getBoundingClientRect();
    const position = {
      x: rect.left + (rect.width / 2),
      y: rect.bottom + 10
    };

    // Set a small delay to allow for double-click or other interactions
    contextMenuTimeoutRef.current = setTimeout(() => {
      setSelectedText(text);
      setPopupPosition(position);
      setIsPopupOpen(true);
      logService.info('Text selected for contextual explanation:', text.substring(0, 50) + '...');
    }, 300);

  }, [minTextLength, enabledElements]);

  const handleRightClick = useCallback((event: MouseEvent) => {
    // Only handle right-click on text selections
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const text = selection.toString().trim();
    if (text.length < minTextLength) return;

    // Check if the right-click happened on or near the selected text
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    
    const clickX = event.clientX;
    const clickY = event.clientY;
    
    // Check if click is within the selected text area (with some tolerance)
    const tolerance = 10;
    if (clickX >= rect.left - tolerance && 
        clickX <= rect.right + tolerance && 
        clickY >= rect.top - tolerance && 
        clickY <= rect.bottom + tolerance) {
      
      event.preventDefault(); // Prevent default context menu
      
      const position = {
        x: event.clientX,
        y: event.clientY
      };

      setSelectedText(text);
      setPopupPosition(position);
      setIsPopupOpen(true);
      logService.info('Right-click contextual explanation:', text.substring(0, 50) + '...');
    }
  }, [minTextLength]);

  const handleClickOutside = useCallback((event: MouseEvent) => {
    // If clicking outside the popup or selected text, close the popup
    const target = event.target as HTMLElement;
    
    // Check if the click is on the popup itself
    const popup = document.querySelector('[data-contextual-popup]');
    if (popup && popup.contains(target)) {
      return; // Don't close if clicking inside the popup
    }

    // Close the popup
    setIsPopupOpen(false);
  }, []);

  const closePopup = useCallback(() => {
    setIsPopupOpen(false);
    setSelectedText('');
    setPopupPosition(null);
    
    // Clear text selection
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
    }
  }, []);

  useEffect(() => {
    // Add event listeners for text selection and right-click
    document.addEventListener('mouseup', handleTextSelection);
    document.addEventListener('contextmenu', handleRightClick);
    document.addEventListener('mousedown', handleClickOutside);

    // Cleanup
    return () => {
      document.removeEventListener('mouseup', handleTextSelection);
      document.removeEventListener('contextmenu', handleRightClick);
      document.removeEventListener('mousedown', handleClickOutside);
      
      if (contextMenuTimeoutRef.current) {
        clearTimeout(contextMenuTimeoutRef.current);
      }
    };
  }, [handleTextSelection, handleRightClick, handleClickOutside]);

  // Close popup on escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isPopupOpen) {
        closePopup();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isPopupOpen, closePopup]);

  return {
    isPopupOpen,
    selectedText,
    popupPosition,
    closePopup
  };
};