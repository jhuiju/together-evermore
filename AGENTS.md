# Architecture rules

- Keep document and root scrolling locked; authenticated pages scroll inside the shared main content area while public pages scroll inside the root page wrapper, so page overflow does not move the outer app shell.