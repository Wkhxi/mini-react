(function () {
  // jsx -- (tsc/babel) --> render function -- (render function执行) --> vdom
  // MiniReact.createElement 就是 render function
  /**
   *
   * @description MiniReact.createElement("a", { href: "xxx" }, "link")
   * @param {*} type 必选，表示 HTML元素标签 ，组件名
   * @param {Object} props 可选，属性元素对象
   * @param  {...any} children 可选，元素下的子内容。一个数组
   * @returns React Element 的结构
   */
  function createElement(type, props, ...children) {
    return {
      type,
      // react中，元素中的子内容也被视为该元素的props的一部分。
      props: {
        ...props,
        children: children.map((child) => {
          // 最终的文本类型是没有children，不需要再遍历下去
          const isTextNode =
            typeof child === "string" || typeof child === "number";
          return isTextNode ? createTextNode(child) : child;
        }),
      },
    };
  }

  // 定义文本类型的React Element元素结构
  function createTextNode(nodeValue) {
    return {
      type: "TEXT_ELEMENT",
      props: {
        nodeValue,
        children: [],
      },
    };
  }

  // vDOM 转换成 fiber 的过程称之为 reconcile 。
  // 他不是一次性完成的，而是通过 scheduler 调度器 根据时间分片分成多个任务完成。
  /**
   * 什么是时间分片？
   * 在传统的同步渲染模式下，React 会从开始到结束一次性完成整个渲染过程。如果某些渲染操作耗时较长，可能会阻塞主线程，导致用户界面卡顿或无响应。
   * 时间分片通过将渲染工作分成多个小任务，并在任务之间让出主线程，使得浏览器可以在空闲时处理用户交互、动画或其他高优先级任务。这种方式不仅能提高用户体验，还能避免长时间的主线程阻塞。
   *    1. 切分任务
            React 将大的渲染任务分解为多个小任务。这些任务不需要一次性完成，而是可以在多个帧中逐步完成。

        2. 优先级调度
            React 内部使用调度器（Scheduler）根据任务的重要性和紧急程度分配优先级。高优先级的任务（如用户输入）会优先执行，而低优先级任务（如后台渲染）会推迟。

        3. 让出主线程
            React 会在执行每个小任务后检查剩余的时间。如果当前帧还有剩余时间，继续执行下一个任务；如果时间不足，React 会暂停任务，让浏览器处理其他工作。


   */

  // 指向下一个要处理的fiber节点
  let nextUnitOfWork = null;

  /**
   * 这里有两个 root，一个是当前正在处理的 fiber 链表的根 wipRoot，一个是之前的历史 fiber 链表的根 currentRoot。
   * 因为初始渲染会生成一个 fiber 链表，然后后面 setState 更新会再生成一个新的 fiber 链表，两个 fiber 链表要做一些对比里决定对 dom 节点的增删改，所以都要保存。
   *
   */
  // 表示当前正在处理的fiber链表的根节点。
  let wipRoot = null;
  // 旧的fiber链表根节点。
  let currentRoot = null;

  let deletions = null;

  // render阶段
  // render 方法里设置初始 nextUnitOfWork
  /**
   *
   * @param {*} element 第一次渲染的时候，拿到的是根组件的信息，type：App。类型是一个函数。需要执行该函数才能拿到App子组件的信息
   * @param {*} container <div id="root"></div>
   */
  function render(element, container) {
    // Tip: 打印render会在workLoop。render会同步执行，而workLoop会在空闲执行。

    // 下面都在进行初始化操作。
    wipRoot = {
      dom: container, // 挂载的展示DOM节点
      props: {
        children: [element], // 第一次渲染的时候，element表示的就是我们的App组件的React Element
      },
      alternate: currentRoot, // 就的Fiber链表
    };

    deletions = [];

    // 当我们nextUnitOfWork设置值以后。由于workLoop不断执行，当发现nextUnitOfWork有值的时候，会进入遍历。
    nextUnitOfWork = wipRoot;
  }

  // 可以把 workLoop 看成类似一个递归函数，会反复循环执行。目的是为了当有需要处理的Fiber节点出现的时候，进行处理
  function workLoop(deadline) {
    // 是否暂停。闲置时间足够为false，不暂停。不够为true，暂停
    let shouldYield = false;

    // 当 指针指向下个 Fiber 节点，并且没有暂停的时候，就会一直循环
    while (nextUnitOfWork && !shouldYield) {
      // 只执行 一个单位的工作
      nextUnitOfWork = performUnitOfWork(nextUnitOfWork);

      // 用于获取当前帧内剩余的时间，单位是毫秒（ms）。它帮助开发者在当前空闲时间内动态安排任务
      // 不断得判断，帧内剩余时间，是否足以执行任务，shouldYield 为 true，表示需要暂停任务执行，让出主线程。
      shouldYield = deadline.timeRemaining() < 1; // 剩余时间是否小于 1ms
    }

    // 结束 fiber 的创建，进入 commit 阶段，开始更新ui
    if (!nextUnitOfWork && wipRoot) {
      commitRoot();
    }

    // 递归 请求下次空闲时间
    requestIdleCallback(workLoop);
  }

  // requestIdleCallback 存在着浏览器的兼容性和触发不稳定的问题
  // react 用的是 requestAnimationFrame （并不能够确保每一帧都执行一次，也可能出现跳帧的情况： 比如主线程被阻塞等原因。 你可以把它理解为 高优先级任务而已）。
  // requestIdleCallback 用于在主线程空闲时执行一些非紧急（低优先级）的任务。将主线程的资源 让给 高优先级的任务，比如用户交互，事件处理、动画渲染、DOM 操作。
  // requestIdleCallback 在浏览器空闲时执行回调函数。回调函数会接受一个IdleDeadline对象作为参数，该对象提供了关于浏览器空闲时间的信息
  // 浏览器为 每一帧16ms 预留了少量的时间供空闲任务执行，如果有剩余时间且主线程空闲，会调用回调。如果没有 这帧将不会执行，等到下一帧。
  requestIdleCallback(workLoop);

  // performUnitOfWork的作用 就是遍历fiber树
  function performUnitOfWork(fiber) {
    // 区分 不同的fiber节点

    const isFunctionComponent = fiber.type instanceof Function;
    if (isFunctionComponent) {
      // 函数组件处理
      updateFunctionComponent(fiber);
    } else {
      // 原生标签处理
      updateHostComponent(fiber);
    }

    // 上面的方法处理完成我们当前Fiber之后，就会开始寻找下一个处理的Fiber，并返回出去
    // 会先从fiber.child一直找到尽头，之后回到上一个节点找他的相邻兄弟组件，然后继续child，依次循环最后回到div#root
    // 按照下面遍历的顺序，最终fiber树就会变成一个fiber链表。
    if (fiber.child) {
      return fiber.child;
    }
    let nextFiber = fiber;
    while (nextFiber) {
      if (nextFiber.sibling) {
        return nextFiber.sibling;
      }
      // 说明兄弟节点处理完成，回到上一个节点return。
      nextFiber = nextFiber.return;
    }
  }

  // 记录当前执行的fiber节点
  let wipFiber = null;
  let stateHookIndex = null;

  // 函数组件处理
  function updateFunctionComponent(fiber) {
    wipFiber = fiber;

    // 初始化
    stateHookIndex = 0;
    // 当前节点里的 useState、useEffect
    wipFiber.stateHooks = []; // 存储 useState 的 hook 的值
    wipFiber.effectHooks = []; // 存储 useEffect 的 hook 的值

    // 此时的fiber.type表示的是函数名。执行函数组件。函数组件的返回值React Element
    const children = [fiber.type(fiber.props)];
    reconcileChildren(fiber, children);
  }

  function updateHostComponent(fiber) {
    if (!fiber.dom) {
      fiber.dom = createDom(fiber);
    }
    reconcileChildren(fiber, fiber.props.children);
  }

  // 创建真实DOM。
  function createDom(fiber) {
    // 根据是文本节点还是元素节点用 document.createElement 或 document.createTextNode 来创建。然后更新 props。
    const dom =
      fiber.type == "TEXT_ELEMENT"
        ? document.createTextNode("")
        : document.createElement(fiber.type);

    // 创建新DOM
    // 不存在 旧props，所以直接传入 {}
    // fiber.props 是当前节点的props，比如 <div id="root"></div>，fiber.props = {id: "root"}
    updateDom(dom, {}, fiber.props);

    return dom;
  }

  // 判断属性是不是事件，特征是前缀带on
  const isEvent = (key) => key.startsWith("on");
  // 属性
  const isProperty = (key) => key !== "children" && !isEvent(key);
  // 属性值是否改变
  const isNew = (prev, next) => (key) => prev[key] !== next[key];
  // 属性是否已经不在新参数里
  const isGone = (prev, next) => (key) => !(key in next);

  // createDom已经创建好DOM，updateDom的工作是对当前的真实Dom的props进行更新，删除。首先删除旧的事件监听器，旧的属性，然后添加新的属性、新的事件监听器。
  /**
   *
   * @param {*} dom 已经创建好的真实DOM
   * @param {*} prevProps 旧的props参数
   * @param {*} nextProps 新的参数
   */
  function updateDom(dom, prevProps, nextProps) {
    //Remove old or changed event listeners
    Object.keys(prevProps)
      .filter(isEvent)
      .filter((key) => !(key in nextProps) || isNew(prevProps, nextProps)(key))
      .forEach((name) => {
        const eventType = name.toLowerCase().substring(2);
        dom.removeEventListener(eventType, prevProps[name]);
      });

    // Remove old properties。对于不在新参数里的属性，设置为空字符串。
    Object.keys(prevProps)
      .filter(isProperty)
      .filter(isGone(prevProps, nextProps))
      .forEach((name) => {
        dom[name] = "";
      });

    // Set new or changed properties。加入新属性。
    Object.keys(nextProps)
      .filter(isProperty)
      .filter(isNew(prevProps, nextProps))
      .forEach((name) => {
        dom[name] = nextProps[name];
      });

    // Add event listeners。增加事件
    Object.keys(nextProps)
      .filter(isEvent)
      .filter(isNew(prevProps, nextProps))
      .forEach((name) => {
        const eventType = name.toLowerCase().substring(2);
        dom.addEventListener(eventType, nextProps[name]);
      });
  }

  // 当前fiber节点下，处理他的子元素们
  /**
   * 将当前fiber下子元素child都处理成fiber节点，最终形成一个fiber链表。
   */
  /**
   *
   * @param {*} wipFiber 当前处理的节点
   * @param {*} elements 该节点的子元素数组
   */
  function reconcileChildren(wipFiber, elements) {
    let index = 0;
    // wipFiber.alternate表示的是旧Fiber链表。
    let oldFiber = wipFiber.alternate?.child;
    let prevSibling = null;

    // oldFiber != null 注意这里：undefined != null 结果 false，undefined !== null 结果true
    while (index < elements.length || oldFiber != null) {
      const element = elements[index];
      let newFiber = null;

      // 如果值undefined、null认为是相同节点。
      const sameType = element?.type == oldFiber?.type;

      // 节点类型相同 -> 那么只需要在原来的DOM上更新属性就行
      if (sameType) {
        // 定义fiber对象
        newFiber = {
          type: oldFiber.type,
          props: element.props,
          dom: oldFiber.dom,
          return: wipFiber,
          alternate: oldFiber,
          effectTag: "UPDATE",
        };
      }

      // 新Fiber元素 -> 进入createDom
      if (element && !sameType) {
        newFiber = {
          type: element.type,
          props: element.props,
          dom: null,
          return: wipFiber,
          alternate: null,
          effectTag: "PLACEMENT",
        };
      }

      // 旧fiber存在 && 类型不同 -> 说明是新的DOM不存在这部份，标记删除
      if (oldFiber && !sameType) {
        oldFiber.effectTag = "DELETION";
        deletions.push(oldFiber);
      }

      // oldFiber设置成下一个兄弟节点，进行下一次同节点的比较
      if (oldFiber) {
        oldFiber = oldFiber.sibling;
      }

      if (index === 0) {
        // index为0作为当前处理节点的child，后续的index>0,则是child的兄弟节点sibling。
        wipFiber.child = newFiber;
      } else if (element) {
        // 此时的prevSibling表示的index-1的节点。即当前newFiber作为上一个fiber的兄弟节点。

        // 兄弟指针
        prevSibling.sibling = newFiber;
      }
      // 设置为当前节点，作为下次循环，给该节点设置兄弟节点
      prevSibling = newFiber;
      index++;
    }
  }

  // 当我们执行函数组件的时候，就会执行hook，进入到hook源码中来
  // 正常情况下，能保存hook信息的fiber，该fiber表示的是函数组件，例如App
  function useState(initialState) {
    const currentFiber = wipFiber;

    /**
     * alternate 是一个非常重要的概念，用于表示同一个组件在不同渲染阶段的两个 Fiber 节点之间的连接。它主要用于实现双缓存机制（Double Buffering），以支持增量更新和性能优化。
     * 在每次渲染时，React 不会重新创建整个 Fiber 树，而是复用旧的 Fiber 节点，避免不必要的计算和内存分配。
        alternate 作为连接两个 Fiber 节点的桥梁，帮助实现高效的节点复用。

     */

    // 从节点，拿到旧的hook信息，里面保存了当前的state、stateHookIndex标志当前处理的是第几个 useState调用
    //
    const oldHook = wipFiber.alternate?.stateHooks[stateHookIndex];

    const stateHook = {
      // 当前state的值。如果有旧的状态，复用它；否则使用初始值 initialState。
      state: oldHook ? oldHook.state : initialState,
      // 存储所有待处理的 setState 动作（包括函数和直接值）
      queue: oldHook ? oldHook.queue : [],
    };

    /**
     * 遍历 queue 中的所有更新函数，依次计算出最新的 state 值。
        更新完成后，清空 queue，以准备下一个渲染周期。
     */
    // 执行setState，得到最新的state结果
    stateHook.queue.forEach((action) => {
      stateHook.state = action(stateHook.state);
    });
    stateHook.queue = [];

    stateHookIndex++;
    wipFiber.stateHooks.push(stateHook);

    function setState(action) {
      // 当我们调用setState的时候，多个setState的调用传入的值，或者函数，都会暂时放入到queue中
      // 下面两行，保证存入的时候函数
      const isFunction = typeof action === "function";
      stateHook.queue.push(isFunction ? action : () => action);

      // 对当前节点更新，加入stateHook的信息。
      wipRoot = {
        ...currentFiber,
        alternate: currentFiber,
      };
      // wipRoot 表示当前正在处理的节点的 根结点 ，nextUnitOfWork表示等会要被处理的节点。
      // 集中加入stateHook信息之后，到下一次workLoop里再去处理。
      nextUnitOfWork = wipRoot;
    }

    return [stateHook.state, setState];
  }

  // 每个函数组件都会有需要执行的useEffect，当执行函数组件的时候，会开始调用useEffect，将回调函数先保存起来
  function useEffect(callback, deps) {
    const effectHook = {
      callback, // 回调函数
      deps, // 依赖数组
      cleanup: undefined, // 清理副作用
    };
    wipFiber.effectHooks.push(effectHook);
  }

  /**
   * 当我们将整棵树遍历成Fiber后，就可以进入commit阶段！！！
   *
   *
   *
   *
   */
  function commitRoot() {
    // 集中把标记删除的节点处理了。
    deletions.forEach(commitWork);
    // div#root本事已经存在，所以从child开始。
    commitWork(wipRoot.child);
    // commitWork完成真实DOM之后，就开始执行effectHook
    commitEffectHooks();

    // 前面的操作已经完成基本渲染，此时的wipRoot成为了旧的fiber链表，保存到currentRoot
    // 并将 wipRoot 清空，表示这次 reconcile 已经完成
    currentRoot = wipRoot;
    wipRoot = null;
  }

  /**
   * 按照 child、sibling 的顺序来递归遍历 fiber 链表。
   */
  // 通过递归的方式，一步步将子元素appendChild插入父元素，界面一点点渲染出来。最终Fiber链表变成了真实DOM树
  // 对于不同标记的fiber，会进行不同的处理：
  //  标志update的会在原来的真实DOM上更新属性，卸载旧属性。
  //  标志删除的，会根据return，拿到父节点，对该节点，removeChild
  //  PLACEMENT 表示要创建
  function commitWork(fiber) {
    if (!fiber) {
      return;
    }

    // 拿到当前处理Fiber的父标签
    let domParentFiber = fiber.return;
    // 假如当前的fiber的父级是App组件，App Fiber并不代表真实的DOM。而应该是上一级的div#root，通过一个循环找到最近的父级
    while (!domParentFiber.dom) {
      domParentFiber = domParentFiber.return;
    }
    // 拿到父级DOM
    const domParent = domParentFiber.dom;

    // 如果当前Fiber是替换，则加入作为父级的子元素，利用appendChild方法
    if (fiber.effectTag === "PLACEMENT" && fiber.dom != null) {
      domParent.appendChild(fiber.dom);
    } else if (fiber.effectTag === "UPDATE" && fiber.dom != null) {
      updateDom(fiber.dom, fiber.alternate.props, fiber.props);
    } else if (fiber.effectTag === "DELETION") {
      commitDeletion(fiber, domParent);
    }

    // 这里可以进行优化，更新阶段，当fiber节点标志移除，意味着整棵子树都被移除了，那么整棵树都不需要再遍历，增了多余appendChild操作。
    commitWork(fiber.child);
    commitWork(fiber.sibling);
  }

  // 对真实DOM，删除节点
  function commitDeletion(fiber, domParent) {
    if (fiber.dom) {
      domParent.removeChild(fiber.dom);
    } else {
      commitDeletion(fiber.child, domParent);
    }
  }

  function isDepsEqual(deps, newDeps) {
    if (deps.length !== newDeps.length) {
      return false;
    }

    for (let i = 0; i < deps.length; i++) {
      if (deps[i] !== newDeps[i]) {
        return false;
      }
    }
    return true;
  }

  /**
   * 清理函数（cleanup）是在新的副作用函数执行之前执行的，并且在组件卸载时也会执行一次。
   */
  // 内部的方法，通过递归，对真个链表的存在的effectHook进行处理
  function commitEffectHooks() {
    // 在我们执行新的useEffect之前，需要对之前的 useEffect 清理副作用的方法（也就是先执行 useEffect return 的函数），进行执行。
    function runCleanup(fiber) {
      if (!fiber) return;
      fiber.alternate?.effectHooks?.forEach((hook, index) => {
        const deps = fiber.effectHooks[index].deps;
        // 比较依赖是否变化，决定是否执行清理副作用
        if (!hook.deps || !isDepsEqual(hook.deps, deps)) {
          hook.cleanup?.();
        }
      });

      runCleanup(fiber.child);
      runCleanup(fiber.sibling);
    }

    // 清理完副作用后，执行方法
    function run(fiber) {
      if (!fiber) return;

      fiber.effectHooks?.forEach((newHook, index) => {
        // 首次渲染：直接执行副作用，并保存返回的 清理函数 cleanup
        if (!fiber.alternate) {
          newHook.cleanup = newHook.callback();
          return;
        }

        // 不存在依赖项：表示每次都会执行副作用
        if (!newHook.deps) {
          newHook.cleanup = newHook.callback();
        }

        // 存在依赖项：比较依赖是否变化，决定是否执行副作用
        if (newHook.deps.length > 0) {
          const oldHook = fiber.alternate?.effectHooks[index];

          if (!isDepsEqual(oldHook.deps, newHook.deps)) {
            newHook.cleanup = newHook.callback();
          }
        }
      });

      run(fiber.child);
      run(fiber.sibling);
    }

    runCleanup(wipRoot);
    run(wipRoot);
  }

  const MiniReact = {
    createElement,
    render,
    useState,
    useEffect,
  };

  window.MiniReact = MiniReact;
})();
