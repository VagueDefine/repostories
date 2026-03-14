import { Bookmark } from '../types';

export const parseBookmarkHtml = (html: string): Bookmark[] => {
  const bookmarks: Bookmark[] = [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  
  const traverse = (element: Element, parentId?: string) => {
    const dts = element.querySelectorAll(':scope > dt');
    
    dts.forEach(dt => {
      const link = dt.querySelector(':scope > a');
      const folderHeader = dt.querySelector(':scope > h3');
      const subDl = dt.querySelector(':scope > dl');

      if (link) {
        bookmarks.push({
          id: Math.random().toString(36).substr(2, 9),
          title: link.textContent || '无标题',
          url: link.getAttribute('href') || '',
          category: '导入',
          description: '',
          createdAt: parseInt(link.getAttribute('add_date') || '0') * 1000 || Date.now(),
          type: 'link',
          parentId
        });
      } else if (folderHeader) {
        const folderId = Math.random().toString(36).substr(2, 9);
        bookmarks.push({
          id: folderId,
          title: folderHeader.textContent || '未命名文件夹',
          url: '',
          category: '文件夹',
          description: '',
          createdAt: parseInt(folderHeader.getAttribute('add_date') || '0') * 1000 || Date.now(),
          type: 'folder',
          parentId
        });
        
        if (subDl) {
          traverse(subDl, folderId);
        } else {
          // Sometimes the DL is a sibling of the DT
          const nextSibling = dt.nextElementSibling;
          if (nextSibling && nextSibling.tagName === 'DL') {
            traverse(nextSibling, folderId);
          }
        }
      }
    });
  };

  const rootDl = doc.querySelector('dl');
  if (rootDl) {
    traverse(rootDl);
  } else {
    // Try to find any DL if root one is missing
    const anyDl = doc.getElementsByTagName('dl')[0];
    if (anyDl) traverse(anyDl);
  }

  return bookmarks;
};
