import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Descendant, Editor } from "slate";
import { Editable, ReactEditor, Slate } from "slate-react";
import { twMerge } from "tailwind-merge";
import { useAutosuggestions } from "../../hooks/use-autosuggestions";
import { useCopilotTextareaEditor } from "../../hooks/use-copilot-textarea-editor";
import {
  getFullEditorTextWithNewlines,
  getTextAroundCursor,
} from "../../lib/get-text-around-cursor";
import { addAutocompletionsToEditor } from "../../lib/slatejs-edits/add-autocompletions";
import { clearAutocompletionsFromEditor } from "../../lib/slatejs-edits/clear-autocompletions";
import { replaceEditorText } from "../../lib/slatejs-edits/replace-text";
import {
  AutosuggestionsBareFunction,
  BaseAutosuggestionsConfig,
  defaultBaseAutosuggestionsConfig,
} from "../../types/base";
import { AutosuggestionState } from "../../types/base/autosuggestion-state";
import { BaseCopilotTextareaProps } from "../../types/base/base-copilot-textarea-props";
import "./base-copilot-textarea.css";
import { makeRenderElementFunction } from "./render-element";
import { makeRenderPlaceholderFunction } from "./render-placeholder";
import { useAddBrandingCss } from "./use-add-branding-css";

export interface HTMLCopilotTextAreaElement extends HTMLElement {
  value: string;
  focus: () => void;
  blur: () => void;
}

export const BaseCopilotTextarea = React.forwardRef(
  (
    props: BaseCopilotTextareaProps & {
      autosuggestionsFunction: AutosuggestionsBareFunction;
    },
    ref: React.Ref<HTMLCopilotTextAreaElement>
  ): JSX.Element => {
    const autosuggestionsConfig: BaseAutosuggestionsConfig = {
      ...defaultBaseAutosuggestionsConfig,
      ...props.autosuggestionsConfig,
    };

    const valueOnInitialRender = useMemo(() => props.value ?? "", []);
    const [lastKnownFullEditorText, setLastKnownFullEditorText] =
      useState(valueOnInitialRender);

    const initialValue: Descendant[] = useMemo(() => {
      return [
        {
          type: "paragraph",
          children: [{ text: valueOnInitialRender }],
        },
      ];
    }, [valueOnInitialRender]);

    const editor = useCopilotTextareaEditor();

    const insertText = useCallback(
      (autosuggestion: AutosuggestionState) => {
        Editor.insertText(editor, autosuggestion.text, {
          at: autosuggestion.point,
        });
      },
      [editor]
    );

    const {
      currentAutocompleteSuggestion,
      onChangeHandler: onChangeHandlerForAutocomplete,
      onKeyDownHandler: onKeyDownHandlerForAutocomplete,
    } = useAutosuggestions(
      autosuggestionsConfig.debounceTime,
      autosuggestionsConfig.acceptAutosuggestionKey,
      props.autosuggestionsFunction,
      insertText,
      autosuggestionsConfig.disableWhenEmpty,
      autosuggestionsConfig.disabled
    );

    // sync autosuggestions state with the editor
    useEffect(() => {
      clearAutocompletionsFromEditor(editor);
      if (currentAutocompleteSuggestion) {
        addAutocompletionsToEditor(
          editor,
          currentAutocompleteSuggestion.text,
          currentAutocompleteSuggestion.point
        );
      }
    }, [currentAutocompleteSuggestion]);

    const suggestionStyleAugmented: React.CSSProperties = useMemo(() => {
      return {
        fontStyle: "italic",
        color: "gray",
        ...props.suggestionsStyle,
      };
    }, [props.suggestionsStyle]);

    useAddBrandingCss(suggestionStyleAugmented, props.disableBranding);

    const renderElementMemoized = useMemo(() => {
      return makeRenderElementFunction(suggestionStyleAugmented);
    }, [suggestionStyleAugmented]);

    const renderPlaceholderMemoized = useMemo(() => {
      // For some reason slateJS specifies a top value of 0, which makes for strange styling. We override this here.
      const placeholderStyleSlatejsOverrides: React.CSSProperties = {
        top: undefined,
      };

      const placeholderStyleAugmented: React.CSSProperties = {
        ...placeholderStyleSlatejsOverrides,
        ...props.placeholderStyle,
      };

      return makeRenderPlaceholderFunction(placeholderStyleAugmented);
    }, [props.placeholderStyle]);

    // update the editor text, but only when the value changes from outside the component
    useEffect(() => {
      if (props.value === lastKnownFullEditorText) {
        return;
      }

      setLastKnownFullEditorText(props.value ?? "");
      replaceEditorText(editor, props.value ?? "");
    }, [props.value]);

    // separate into TextareaHTMLAttributes<HTMLDivElement> and CopilotTextareaProps
    const {
      placeholderStyle,
      value,
      onValueChange,
      autosuggestionsConfig: autosuggestionsConfigFromProps,
      autosuggestionsFunction,
      className,
      onChange,
      onKeyDown,
      ...propsToForward
    } = props;

    const moddedClassName = (() => {
      const baseClassName = "copilot-textarea";
      const brandingClass = props.disableBranding
        ? "no-branding"
        : "with-branding";
      const defaultTailwindClassName = "bg-white overflow-y-auto resize-y";
      const mergedClassName = twMerge(
        defaultTailwindClassName,
        className ?? ""
      );
      return `${baseClassName} ${brandingClass} ${mergedClassName}`;
    })();

    React.useImperativeHandle(
      ref,
      () => {
        class Combined {
          constructor(
            private customMethods: CustomMethods,
            private editorHtmlElement: HTMLElement
          ) {}

          [key: string]: any;

          get(target: any, propKey: string): any {
            if (this.isKeyOfCustomMethods(propKey)) {
              const value = this.customMethods[propKey];
              if (typeof value === "function") {
                return value.bind(this.customMethods);
              }
              return value;
            } else if (this.isKeyOfHTMLElement(propKey)) {
              const value = this.editorHtmlElement[propKey];
              if (typeof value === "function") {
                return value.bind(this.editorHtmlElement);
              }
              return value;
            }
          }

          set(target: any, propKey: string, value: any): boolean {
            if (this.isKeyOfCustomMethods(propKey)) {
              (this.customMethods as any)[propKey] = value;
            } else if (this.isKeyOfHTMLElement(propKey)) {
              (this.editorHtmlElement as any)[propKey] = value;
            } else {
              // Default behavior (optional)
              target[propKey] = value;
            }
            return true;
          }

          private isKeyOfCustomMethods(
            key: string
          ): key is keyof CustomMethods {
            return key in this.customMethods;
          }

          private isKeyOfHTMLElement(key: string): key is keyof HTMLElement {
            return key in this.editorHtmlElement;
          }
        }

        const handler = {
          get(target: any, propKey: keyof CustomMethods | keyof HTMLElement) {
            return target.get(target, propKey);
          },
          set(
            target: any,
            propKey: keyof CustomMethods | keyof HTMLElement,
            value: any
          ) {
            return target.set(target, propKey, value);
          },
        };

        class CustomMethods {
          constructor(private editor: Editor) {}

          focus() {
            ReactEditor.focus(this.editor);
          }

          blur() {
            ReactEditor.blur(this.editor);
          }

          get value() {
            return getFullEditorTextWithNewlines(this.editor);
          }
          set value(value: string) {
            replaceEditorText(this.editor, value);
          }
        }

        const editorHtmlElement = ReactEditor.toDOMNode(editor, editor);
        const customMethods = new CustomMethods(editor);

        const combined = new Combined(customMethods, editorHtmlElement);
        return new Proxy(combined, handler);
      },
      [editor]
    );

    return (
      <Slate
        editor={editor}
        initialValue={initialValue}
        onChange={(value) => {
          const newEditorState = getTextAroundCursor(editor);

          const fullEditorText = newEditorState
            ? newEditorState.textBeforeCursor + newEditorState.textAfterCursor
            : getFullEditorTextWithNewlines(editor); // we don't double-parse the editor. When `newEditorState` is null, we didn't parse the editor yet.

          setLastKnownFullEditorText(fullEditorText);
          onChangeHandlerForAutocomplete(newEditorState);

          props.onValueChange?.(fullEditorText);
          props.onChange?.(makeSemiFakeReactTextAreaEvent(fullEditorText));
        }}
      >
        <Editable
          renderElement={renderElementMemoized}
          renderPlaceholder={renderPlaceholderMemoized}
          onKeyDown={(event) => {
            onKeyDownHandlerForAutocomplete(event); // forward the event for internal use
            props.onKeyDown?.(event); // forward the event for external use
          }}
          className={moddedClassName}
          {...propsToForward}
        />
      </Slate>
    );
  }
);

// Consumers of <textarea> expect a `onChange: (React.ChangeEvent<HTMLTextAreaElement>) => void` event handler to be passed in.
// This is *extremely* common, and we want to support it.
//
// We can't support the full functionality, but in 99% of cases, the consumer only cares about the `event.target.value` property --
// that's how they get the new value of the textarea.
//
// So, the tradeoff we are making is minimizing compiler complaint, with a small chance of runtime error.
// The alternative would be defining a different onChange entrypoint (we actually do have that in `onValueChange`),
// And starting to explain subtleties to users the moment they try to use the component for the first time for very basic functionality.
//
// If this proves problematic, we can always revisit this decision.
function makeSemiFakeReactTextAreaEvent(
  currentText: string
): React.ChangeEvent<HTMLTextAreaElement> {
  return {
    target: {
      value: currentText,
      type: "copilot-textarea",
    },
    currentTarget: {
      value: currentText,
      type: "copilot-textarea",
    },
  } as React.ChangeEvent<HTMLTextAreaElement>;
}
