import React, {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from "react";
import { useId, useForkedRef } from "@reach/utils";
import { wrapEvent } from "@reach/utils";
import Popover from "@reach/popover";
import { assign, interpret, Machine } from "xstate";

////////////////////////////////////////////////////////////////////////////////
// STATES
const CLICKING_BUTTON = "CLICKING_BUTTON";
const CLICKING_ITEM = "CLICKING_ITEM";
const CONFIRMING = "CONFIRMING";
const IDLE = "IDLE";
const SEARCHING = "SEARCHING";
const SELECTING = "SELECTING";
const SELECTING_WITH_DRAG = "SELECTING_WITH_DRAG";
const SELECTING_WITH_KEYS = "SELECTING_WITH_KEYS";

// EVENTS
const BLUR = "BLUR";
const BUTTON_CLICK = "BUTTON_CLICK";
const BUTTON_POINTER_DOWN = "BUTTON_POINTER_DOWN";
const BUTTON_POINTER_LEAVE = "BUTTON_POINTER_LEAVE";
const BUTTON_POINTER_MOVE = "BUTTON_POINTER_MOVE";
const BUTTON_POINTER_UP = "BUTTON_POINTER_UP";
const DOC_POINTER_UP = "DOC_POINTER_UP";
const ITEM_POINTER_DOWN = "ITEM_POINTER_DOWN";
const ITEM_POINTER_ENTER = "ITEM_POINTER_ENTER";
const ITEM_POINTER_LEAVE = "ITEM_POINTER_LEAVE";
const ITEM_POINTER_UP = "ITEM_POINTER_UP";
const LIST_POINTER_LEAVE = "LIST_POINTER_LEAVE";
const KEYDOWN_ARROW_DOWN = "KEYDOWN_ARROW_DOWN";
const KEYDOWN_ARROW_UP = "KEYDOWN_ARROW_UP";
const KEYDOWN_CHAR = "KEYDOWN_CHAR";
const KEYDOWN_END = "KEYDOWN_END";
const KEYDOWN_ENTER = "KEYDOWN_ENTER";
const KEYDOWN_ESCAPE = "KEYDOWN_ESCAPE";
const KEYDOWN_HOME = "KEYDOWN_HOME";
const KEYDOWN_SPACE = "KEYDOWN_SPACE";
const POINTER_MOVE = "POINTER_MOVE";

// ACTIONS
const ASSIGN_REFS_FOR_CLOSE = "ASSIGN_REFS_FOR_CLOSE";
const CONCAT_SEARCH = "CONCAT_SEARCH";
const DISABLE_TOOLTIPS = "DISABLE_TOOLTIPS";
const ENABLE_TOOLTIPS = "ENABLE_TOOLTIPS";
const FOCUS_BUTTON = "FOCUS_BUTTON";
const FOCUS_LISTBOX = "FOCUS_LISTBOX";
const FOCUS_SELECTED_ITEM = "FOCUS_SELECTED_ITEM";
const HIGHLIGHT_FIRST = "HIGHLIGHT_FIRST";
const HIGHLIGHT_ITEM = "HIGHLIGHT_ITEM";
const HIGHLIGHT_LAST = "HIGHLIGHT_LAST";
const HIGHLIGHT_NEXT = "HIGHLIGHT_NEXT";
const HIGHLIGHT_PREV = "HIGHLIGHT_PREV";
const HIGHLIGHT_SEARCH_MATCH = "HIGHLIGHT_SEARCH_MATCH";
const HIGHLIGHT_SELECTED_ITEM = "HIGHLIGHT_SELECTED_ITEM";
const RESET_HIGHLIGHT_INDEX = "RESET_HIGHLIGHT_INDEX";
const RESET_SEARCH = "RESET_SEARCH";
const RESET_SEARCH_START_INDEX = "RESET_SEARCH_START_INDEX";
const SELECT_FIRST = "SELECT_FIRST";
const SELECT_ITEM = "SELECT_ITEM";
const SELECT_LAST = "SELECT_LAST";
const SELECT_NEXT = "SELECT_NEXT";
const SELECT_PREV = "SELECT_PREV";
const SET_SEARCH_START_INDEX = "SET_SEARCH_START_INDEX";
const START_DRAG = "START_DRAG";
const SUBMIT = "SUBMIT";

////////////////////////////////////////////////////////////////////////////////
// STATE MACHINE STUFF
////////////////////////////////////////////////////////////////////////////////
const MachineContext = createContext();
const RootIdContext = createContext();

function MachineProvider({ chart, refs, children }) {
  const service = useMachine(chart, refs);
  const rootId = useId();
  return (
    <RootIdContext.Provider value={rootId}>
      <MachineContext.Provider children={children} value={service} />
    </RootIdContext.Provider>
  );
}

function useRootId() {
  return useContext(RootIdContext);
}

function useMachineState() {
  return useContext(MachineContext).state.value;
}

function useMachineContext() {
  return useContext(MachineContext).state.context;
}

function useMachineSend() {
  return useContext(MachineContext).send;
}

function useMachineRefs() {
  return useContext(MachineContext).refs;
}

function useMachine(chart, refs, debug = true) {
  const [state, setState] = useState(chart.initialState);

  const serviceRef = useRef(null);
  if (serviceRef.current === null) {
    serviceRef.current = interpret(chart).start();
  }

  // add refs to every event so we can use them to perform actions previous
  // strategy was send an "update" event to the machine whenever we rendered in
  // React, but that got a little unweildy (had to add UPDATE events to every
  // state, caused lots of noise in the service subscription), this seems
  // better.
  const send = rawEvent => {
    const event = typeof rawEvent === "string" ? { type: rawEvent } : rawEvent;
    if (event.refs) throw new Error("refs is a reserved event key");
    const unwrapped = Object.keys(refs).reduce((unwrapped, name) => {
      unwrapped[name] = refs[name].current;
      return unwrapped;
    }, {});
    serviceRef.current.send({ ...event, refs: unwrapped });
  };

  useEffect(() => {
    serviceRef.current.subscribe((state, event) => {
      if (debug) {
        console.groupCollapsed(state.value);
        console.log("event", event);
        console.log("context", state.context);
        console.groupEnd(state.value);
      }
      setState(state);
    });
    return () => {
      serviceRef.current.stop();
      serviceRef.current = null;
    };
  }, [chart, debug]);

  return { state, send, refs };
}

////////////////////////////////////////////////////////////////////////////////
// STATE CHART!
////////////////////////////////////////////////////////////////////////////////
const selectingEvents = {
  [KEYDOWN_ARROW_UP]: {
    target: SELECTING_WITH_KEYS,
    actions: [HIGHLIGHT_NEXT]
  },
  [KEYDOWN_ARROW_DOWN]: {
    target: SELECTING_WITH_KEYS,
    actions: [HIGHLIGHT_NEXT]
  },
  [ITEM_POINTER_ENTER]: {
    target: SELECTING,
    actions: [HIGHLIGHT_ITEM]
  },
  [ITEM_POINTER_LEAVE]: {
    target: SELECTING,
    actions: [RESET_HIGHLIGHT_INDEX]
  },
  [ITEM_POINTER_DOWN]: CLICKING_ITEM,
  [ITEM_POINTER_UP]: {
    target: CONFIRMING,
    cond: "dragStarted"
  },
  [DOC_POINTER_UP]: {
    target: IDLE,
    actions: [FOCUS_BUTTON],
    cond: "dragStarted"
  },
  [KEYDOWN_ENTER]: {
    target: CONFIRMING,
    cond: "hasHighlight"
  },
  [KEYDOWN_SPACE]: {
    target: CONFIRMING,
    cond: "hasHighlight"
  },
  [KEYDOWN_HOME]: {
    target: SELECTING_WITH_KEYS,
    actions: [HIGHLIGHT_FIRST]
  },
  [KEYDOWN_END]: {
    target: SELECTING_WITH_KEYS,
    actions: [HIGHLIGHT_LAST]
  },
  [KEYDOWN_CHAR]: {
    target: SEARCHING, // TODO...
    actions: [CONCAT_SEARCH, SET_SEARCH_START_INDEX]
  }
};

const openEvents = {
  [KEYDOWN_ESCAPE]: {
    target: IDLE,
    actions: [FOCUS_BUTTON],
    cond: "notConfirming"
  },
  [BLUR]: {
    target: IDLE,
    cond: "notConfirming"
  }
};

const chart = {
  id: "listbox",
  initial: IDLE,

  context: {
    searchStartIndex: -1,
    index: 0,
    search: "",
    selectedIndex: 0,
    highlightIndex: -1,

    // refs
    button: null,
    listbox: null,
    items: null
  },

  states: {
    [IDLE]: {
      on: {
        [BUTTON_CLICK]: {
          target: SELECTING
        },
        [BUTTON_POINTER_DOWN]: {
          target: CLICKING_BUTTON
        },
        [KEYDOWN_ENTER]: {
          target: IDLE,
          actions: [SUBMIT],
          cond: "isFormElement"
        },
        [KEYDOWN_SPACE]: {
          target: SELECTING_WITH_KEYS,
          actions: [FOCUS_SELECTED_ITEM]
        },
        [KEYDOWN_ARROW_DOWN]: {
          target: SELECTING_WITH_KEYS,
          actions: [FOCUS_SELECTED_ITEM]
        },
        [KEYDOWN_ARROW_UP]: {
          target: SELECTING_WITH_KEYS,
          actions: [FOCUS_SELECTED_ITEM]
        },
        [KEYDOWN_CHAR]: {
          target: IDLE, // TODO...
          actions: [CONCAT_SEARCH, SET_SEARCH_START_INDEX]
        }
      }
    },
    [SEARCHING]: {
      on: {
        ...openEvents
        // TODO
      }
    },
    [SELECTING]: {
      entry: [FOCUS_SELECTED_ITEM],
      on: {
        ...openEvents,
        ...selectingEvents
      }
    },
    [SELECTING_WITH_KEYS]: {
      entry: [FOCUS_SELECTED_ITEM],
      on: {
        ...openEvents,
        ...selectingEvents,
        [POINTER_MOVE]: {
          target: SELECTING,
          actions: [RESET_HIGHLIGHT_INDEX]
        }
      }
    },
    [SELECTING_WITH_DRAG]: {
      entry: [START_DRAG],
      on: {
        ...openEvents,
        ...selectingEvents,
        [ITEM_POINTER_ENTER]: {
          ...selectingEvents[ITEM_POINTER_ENTER],
          target: SELECTING_WITH_DRAG
        },
        [ITEM_POINTER_LEAVE]: {
          ...selectingEvents[ITEM_POINTER_LEAVE],
          target: SELECTING_WITH_DRAG
        }
      }
    },
    [CONFIRMING]: {
      after: {
        2000: {
          target: IDLE,
          actions: [FOCUS_BUTTON, SELECT_ITEM]
        }
      }
    },
    [CLICKING_BUTTON]: {
      entry: [HIGHLIGHT_SELECTED_ITEM],
      after: {
        2000: SELECTING_WITH_DRAG
      },
      on: {
        [BUTTON_POINTER_UP]: SELECTING,
        [BUTTON_POINTER_LEAVE]: SELECTING_WITH_DRAG
      }
    },
    [CLICKING_ITEM]: {
      after: {
        2000: SELECTING_WITH_DRAG
      },
      on: {
        [ITEM_POINTER_LEAVE]: SELECTING_WITH_DRAG,
        [ITEM_POINTER_UP]: {
          target: CONFIRMING
        }
      }
    }
  }
};

const actions = {
  [FOCUS_BUTTON]: (ctx, event) => {
    ((event.refs && event.refs.button) || ctx.button).focus();
  },
  [FOCUS_LISTBOX]: (ctx, event) => {
    // need to let the keydown event finish before moving focus
    requestAnimationFrame(() => {
      event.refs.listbox.focus();
    });
  },

  [HIGHLIGHT_FIRST]: assign({ highlightIndex: 0 }),
  [HIGHLIGHT_LAST]: assign({ highlightIndex: ctx => ctx.items().length - 1 }),
  [HIGHLIGHT_ITEM]: assign({ highlightIndex: (ctx, event) => event.index }),
  [HIGHLIGHT_NEXT]: assign({
    highlightIndex: (ctx, event) => {
      const { items } = event.refs;
      console.log(items);
      return (ctx.highlightIndex + 1) % items.length;
    }
  }),
  [HIGHLIGHT_PREV]: assign({
    highlightIndex: (ctx, event) => {
      const { items } = event.refs;
      return (ctx.highlightIndex + items.length - 1) % items.length;
    }
  }),
  [RESET_HIGHLIGHT_INDEX]: assign({ highlightIndex: -1 }),

  [SELECT_FIRST]: assign({ selectedIndex: 0 }),
  [SELECT_LAST]: assign({ selectedIndex: ctx => ctx.items().length - 1 }),
  [SELECT_ITEM]: assign({ selectedIndex: (ctx, event) => event.index }),
  [SELECT_NEXT]: assign({
    selectedIndex: (ctx, event) => {
      const { items } = event.refs;
      console.log(items);
      return (ctx.selectedIndex + 1) % items.length;
    }
  }),
  [SELECT_PREV]: assign({
    selectedIndex: (ctx, event) => {
      const { items } = event.refs;
      return (ctx.selectedIndex + items.length - 1) % items.length;
    }
  }),

  // tooltips
  [DISABLE_TOOLTIPS]: () => {
    window.__REACH_DISABLE_TOOLTIPS = false;
  },

  [ENABLE_TOOLTIPS]: () => {
    window.__REACH_DISABLE_TOOLTIPS = true;
  },

  // Search
  [RESET_SEARCH]: assign({ search: "" }),

  [CONCAT_SEARCH]: assign({ search: (ctx, event) => ctx.search + event.key }),

  [SET_SEARCH_START_INDEX]: assign({
    searchStartIndex: ctx => ctx.selectedIndex
  }),

  [RESET_SEARCH_START_INDEX]: assign({ searchStartIndex: -1 }),

  [HIGHLIGHT_SEARCH_MATCH]: assign({
    highlightIndex: (ctx, event) => {
      const { searchStartIndex, search } = ctx;
      const searchString = search.toLowerCase();
      const { items } = event.refs;
      const reordered = items
        .slice(searchStartIndex + 1)
        .concat(items.slice(0, searchStartIndex));

      for (let i = 0, l = reordered.length; i < l; i++) {
        const itemText = reordered[i].searchText.toLowerCase();
        if (itemText.startsWith(searchString)) {
          // adjust the index back since we rearranged them
          // there is a math way to do this like:
          // return searchStartIndex + 1 + i % items.length;
          // but it's too late right now
          return items.findIndex(item => item === reordered[i]);
        }
      }
      return -1;
    }
  }),

  [SELECT_ITEM]: (ctx, event) => {
    const { items } = ctx;
    items[ctx.selectedIndex].onSelect();
  },

  [ASSIGN_REFS_FOR_CLOSE]: assign({
    button: (ctx, event) => event.refs.button,
    items: (ctx, event) => event.refs.items
  })
};

const guards = {
  hasHighlight: ctx => ctx.selectedIndex > -1,
  clickedNonListboxOption: (ctx, event) =>
    !event.refs.listbox.contains(event.relatedTarget)
};

if (__DEV__) {
  validate(chart, actions, guards);
}

function validate(chart, actions, guards) {
  let usedActions = {};
  let usedGuards = {};

  for (let state in chart.states) {
    let eventActions = [];
    let entry = chart.states[state].entry;
    let exit = chart.states[state].exit;
    if (entry) eventActions.push(...entry);
    if (exit) eventActions.push(...exit);
    let events = {
      ...chart.states[state].on,
      ...chart.states[state].after
    };
    for (let event in events) {
      if (events[event].actions) {
        eventActions.push(...events[event].actions);
      }
      const guard = events[event].cond;
      if (guard) {
        usedGuards[guard] = true;
        if (!guards[guard]) {
          console.warn(
            `Guard not found: "${guard}" for ${chart.id} "${state}"`
          );
        }
      }
    }
    for (let action of eventActions) {
      usedActions[action] = true;
      if (!actions[action]) {
        console.warn(
          `Action not found: "${action}" for ${chart.id} "${state}"`
        );
      }
    }
  }

  for (let action in actions) {
    if (!usedActions[action]) {
      console.warn(`Defined action "${action}" is not used in the chart.`);
    }
  }
}

const machine = Machine(chart, { actions, guards });

////////////////////////////////////////////////////////////////////////////////
export const ListboxProvider = ({ children }) => {
  return (
    <MachineProvider
      children={children}
      chart={machine}
      refs={{
        button: useRef(null),
        listbox: useRef(null),
        items: useDescendants()
      }}
    />
  );
};

if (__DEV__) {
  ListboxProvider.displayName = "ListboxProvider";
}

////////////////////////////////////////////////////////////////////////////////
export const ListboxButton = forwardRef(
  (
    {
      as: Comp = "button",
      onPointerDown,
      onPointerUp,
      onPointerMove,
      onPointerLeave,
      onKeyDown,
      onClick,
      ...props
    },
    forwardedRef
  ) => {
    const { button } = useMachineRefs();
    const ref = useForkedRef(forwardedRef, button);
    const send = useMachineSend();

    // Can we do this in the state machine instead with enter/leave?
    // Maybe a provider "setup" function?
    // Maybe 1st class "doc" events if we need them?
    // The button is a weird place though...
    useEffect(() => {
      const up = () => send(DOC_POINTER_UP);
      document.addEventListener("pointerup", up);
      return () => document.removeEventListener("pointerup", up);
    }, [send]);

    const handlePointerDown = wrapEvent(onPointerDown, () => {
      send(BUTTON_POINTER_DOWN);
    });

    const handlePointerMove = wrapEvent(onPointerMove, () => {
      send(BUTTON_POINTER_MOVE);
    });

    const handlePointerUp = wrapEvent(onPointerDown, () => {
      send(BUTTON_POINTER_UP);
    });

    const handlePointerLeave = wrapEvent(onPointerLeave, () => {
      send(BUTTON_POINTER_LEAVE);
    });

    const handleKeyDown = wrapEvent(onKeyDown, event => {
      switch (event.key) {
        case " ":
          send(KEYDOWN_SPACE);
          break;
        case "Enter":
          send(KEYDOWN_ENTER);
          break;
        case "ArrowDown":
          send(KEYDOWN_ARROW_DOWN);
          break;
        case "ArrowUp":
          send(KEYDOWN_ARROW_UP);
          break;
        default: {
        }
      }
    });

    const handleClick = wrapEvent(onClick, event => {
      send(BUTTON_CLICK);
    });

    const labelId = "TODO";
    const rootId = useRootId();
    const id = `${rootId}--button`;
    const expanded = useIsVisible();

    return (
      <Comp
        ref={ref}
        data-reach-listbox-button=""
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={expanded}
        aria-labelledby={`${labelId} ${id}`}
        id={id}
        {...props}
      />
    );
  }
);

if (__DEV__) {
  ListboxButton.propTypes = {};
  ListboxButton.displayName = "ListboxButton";
}

////////////////////////////////////////////////////////////////////////////////
export const ListboxPopover = forwardRef(
  ({ as = "div", portal = true, ...props }, forwardedRef) => {
    const Comp = portal ? Popover : as;
    const { button } = useMachineRefs();
    const popupProps = portal ? { targetRef: button } : {};
    const { selectedIndex } = useMachineContext();
    const rootId = useRootId();
    const buttonId = `${rootId}--button`;
    const activeDescendant = `${rootId}--option-${selectedIndex}`;

    return (
      <Comp
        as={portal ? as : undefined}
        ref={forwardedRef}
        data-reach-listbox-popover=""
        tabIndex={-1}
        role="listbox"
        aria-labelledby={buttonId}
        aria-activedescendant={activeDescendant}
        {...popupProps}
        {...props}
      />
    );
  }
);

if (__DEV__) {
  ListboxPopover.propTypes = {};
  ListboxPopover.displayName = "ListboxPopover";
}

////////////////////////////////////////////////////////////////////////////////
export const Listbox = forwardRef(
  (
    {
      as: Comp = "div",
      onKeyDown,
      onKeyPress,
      onBlur,
      onPointerUp,
      onPointerLeave,
      name,
      ...props
    },
    forwardedRef
  ) => {
    const { listbox, items } = useMachineRefs();
    const send = useMachineSend();
    const ref = useForkedRef(forwardedRef, listbox);

    const handleKeyDown = wrapEvent(onKeyDown, event => {
      switch (event.key) {
        case "Tab":
          event.preventDefault();
          break;
        case "Escape":
          send(KEYDOWN_ESCAPE);
          break;
        case "ArrowDown":
          send(KEYDOWN_ARROW_DOWN);
          break;
        case "ArrowUp":
          send(KEYDOWN_ARROW_UP);
          break;
        case "Enter": {
          send(KEYDOWN_ENTER);
          break;
        }
        case " ": {
          send(KEYDOWN_SPACE);
          break;
        }
        case "Home": {
          send(KEYDOWN_HOME);
          break;
        }
        case "End": {
          send(KEYDOWN_END);
          break;
        }
        default: {
        }
      }
    });

    const handleBlur = wrapEvent(onBlur, event => {
      send(BLUR);
    });

    const handlePointerLeave = wrapEvent(onPointerLeave, event => {
      send(LIST_POINTER_LEAVE);
    });

    const handleKeyPress = wrapEvent(onKeyPress, event => {
      send({ type: KEYDOWN_CHAR, key: event.key });
    });

    const isVisible = useIsVisible();
    const rootId = useRootId();
    const id = `${rootId}--listbox`;

    const value = "TODO";

    return (
      <ListboxProvider>
        <DescendantProvider items={items}>
          <Comp
            ref={ref}
            onKeyDown={handleKeyDown}
            onKeyPress={handleKeyPress}
            onBlur={handleBlur}
            onPointerLeave={handlePointerLeave}
            data-reach-listbox=""
            data-closed={!isVisible ? "" : undefined}
            id={id}
            {...props}
          />
          {name && (
            // If the listbox is used in a form we'll need an input field to
            // capture its value. We use the name prop here, a la to @reach/slider
            <input
              type="hidden"
              value={value}
              name={name}
              id={`${rootId}--input`}
            />
          )}
        </DescendantProvider>
      </ListboxProvider>
    );
  }
);

if (__DEV__) {
  Listbox.propTypes = {};
  Listbox.displayName = "Listbox";
}

////////////////////////////////////////////////////////////////////////////////
export const ListboxOption = forwardRef(
  (
    {
      as: Comp = "div",
      onSelect,
      onPointerDown,
      onPointerUp,
      onPointerLeave,
      onPointerEnter,
      ...props
    },
    forwardedRef
  ) => {
    const send = useMachineSend();

    // const events = wrapEvents(props, {
    //   onPointerDown:
    // })
    const handlePointerDown = wrapEvent(onPointerDown, () => {
      send(ITEM_POINTER_DOWN);
    });

    const handlePointerUp = wrapEvent(onPointerUp, () => {
      send(ITEM_POINTER_UP);
    });

    const handlePointerEnter = wrapEvent(onPointerEnter, () => {
      send({ type: ITEM_POINTER_ENTER, index });
    });

    const handlePointerLeave = wrapEvent(onPointerLeave, () => {
      send(ITEM_POINTER_LEAVE);
    });

    const ownRef = useRef(null);
    const ref = useForkedRef(forwardedRef, ownRef);
    const index = useDescendant({ name: props.children, ref, onSelect });
    const { selectedIndex } = useMachineContext();
    const state = useMachineState();

    const id = `${useRootId()}--option-${index}`;
    const isSelected = selectedIndex === index;
    const confirming = isSelected && state === CONFIRMING;

    return (
      <Comp
        ref={ref}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onPointerEnter={handlePointerEnter}
        data-reach-listbox-option=""
        data-confirming={confirming ? "" : undefined}
        aria-selected={isSelected}
        role="option"
        id={id}
        {...props}
      />
    );
  }
);

if (__DEV__) {
  ListboxOption.propTypes = {};
  ListboxOption.displayName = "ListboxOption";
}

////////////////////////////////////////////////////////////////////////////////
function useIsVisible() {
  const state = useMachineState();
  return state.startsWith("open");
}

////////////////////////////////////////////////////////////////////////////////
// DESCENDANTS!
////////////////////////////////////////////////////////////////////////////////

const DescendantContext = createContext();

export function useDescendants() {
  return useRef([]);
}

export function DescendantProvider({ items, ...props }) {
  // On the first render we say we're "assigning", and the children will push
  // into the array when they show up in their own useLayoutEffect.
  const assigning = useRef(true);

  // since children are pushed into the array in useLayoutEffect of the child,
  // children can't read their index on first render.  So we need to cause a
  // second render so they can read their index.
  const [, forceUpdate] = useState();

  // parent useLayoutEffect is always last
  useLayoutEffect(() => {
    if (assigning.current) {
      // At this point all of the children have pushed into the array so we set
      // assigning to false and force an update. Since we're in
      // useLayoutEffect, we won't get a flash of rendered content, it will all
      // happen synchronously. And now that this is false, children won't push
      // into the array on the forceUpdate
      assigning.current = false;
      forceUpdate({});
    } else {
      // After the forceUpdate completes, we end up here and set assigning back
      // to true for the next update from the app
      assigning.current = true;
    }
    return () => {
      // this cleanup function runs right before the next render, so it's the
      // right time to empty out the array to be reassigned with whatever shows
      // up next render.
      if (assigning.current) {
        // we only want to empty out the array before the next render cycle if
        // it was NOT the result of our forceUpdate, so being guarded behind
        // assigning.current works
        items.current = [];
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <DescendantContext.Provider {...props} value={{ items, assigning }} />;
}

export function useDescendant(descendant) {
  const { assigning, items } = useContext(DescendantContext);
  const index = useRef(-1);

  useLayoutEffect(() => {
    if (assigning.current) {
      index.current = items.current.push(descendant) - 1;
    }
  });

  // first render its wrong, after a forceUpdate in parent useLayoutEffect it's
  // right, and its all synchronous so we don't get any flashing
  return index.current;
}