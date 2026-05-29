'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

export default function EditorPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [fabricLoaded, setFabricLoaded] = useState(false)
  const [canvas, setCanvas] = useState<any>(null)
  const [history, setHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [activeTool, setActiveTool] = useState<'select'|'text'|'rect'|'ellipse'>('select')
  const [bgImage, setBgImage] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const exportRef = useRef<HTMLAnchorElement>(null)

  useEffect(() => {
    // Load Fabric.js from CDN
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/fabric.js/5.3.1/fabric.min.js'
    script.onload = () => setFabricLoaded(true)
    document.head.appendChild(script)
    return () => { document.head.removeChild(script) }
  }, [])

  useEffect(() => {
    if (!fabricLoaded || !canvasRef.current) return
    const fabric = (window as any).fabric
    const fc = new fabric.Canvas(canvasRef.current, {
      width: 800, height: 800,
      backgroundColor: '#ffffff',
    })

    // Save state on object modification
    const saveState = () => {
      const json = JSON.stringify(fc.toJSON())
      setHistory(prev => {
        const newHist = prev.slice(0, historyIndex + 1)
        newHist.push(json)
        return newHist.slice(-50) // max 50 states
      })
      setHistoryIndex(prev => Math.min(prev + 1, 49))
    }

    fc.on('object:modified', saveState)
    fc.on('object:added', saveState)
    fc.on('object:removed', saveState)

    setCanvas(fc)
    saveState()

    return () => { fc.dispose() }
  }, [fabricLoaded])

  function addText() {
    if (!canvas) return
    const fabric = (window as any).fabric
    const text = new fabric.IText('Текст тут', {
      left: 100, top: 100,
      fontSize: 32, fontFamily: 'Arial',
      fill: '#000000',
    })
    canvas.add(text)
    canvas.setActiveObject(text)
    canvas.renderAll()
  }

  function addRect() {
    if (!canvas) return
    const fabric = (window as any).fabric
    const rect = new fabric.Rect({
      left: 100, top: 100, width: 200, height: 100,
      fill: '#6366f1', rx: 10, ry: 10,
    })
    canvas.add(rect)
    canvas.setActiveObject(rect)
    canvas.renderAll()
  }

  function addEllipse() {
    if (!canvas) return
    const fabric = (window as any).fabric
    const ellipse = new fabric.Ellipse({
      left: 100, top: 100, rx: 100, ry: 60,
      fill: '#10b981',
    })
    canvas.add(ellipse)
    canvas.setActiveObject(ellipse)
    canvas.renderAll()
  }

  function deleteSelected() {
    if (!canvas) return
    const obj = canvas.getActiveObject()
    if (obj) { canvas.remove(obj); canvas.renderAll() }
  }

  function undo() {
    if (!canvas || historyIndex <= 0) return
    const newIdx = historyIndex - 1
    canvas.loadFromJSON(JSON.parse(history[newIdx]), () => canvas.renderAll())
    setHistoryIndex(newIdx)
  }

  function redo() {
    if (!canvas || historyIndex >= history.length - 1) return
    const newIdx = historyIndex + 1
    canvas.loadFromJSON(JSON.parse(history[newIdx]), () => canvas.renderAll())
    setHistoryIndex(newIdx)
  }

  function exportPNG() {
    if (!canvas || !exportRef.current) return
    const dataUrl = canvas.toDataURL({ format: 'png', quality: 1, multiplier: 2 })
    exportRef.current.href = dataUrl
    exportRef.current.download = `kartka-editor-${Date.now()}.png`
    exportRef.current.click()
  }

  function exportJPEG() {
    if (!canvas || !exportRef.current) return
    const dataUrl = canvas.toDataURL({ format: 'jpeg', quality: 0.92, multiplier: 2 })
    exportRef.current.href = dataUrl
    exportRef.current.download = `kartka-editor-${Date.now()}.jpg`
    exportRef.current.click()
  }

  function loadBackground(e: React.ChangeEvent<HTMLInputElement>) {
    if (!canvas || !e.target.files?.[0]) return
    const fabric = (window as any).fabric
    const reader = new FileReader()
    reader.onload = (ev) => {
      const url = ev.target?.result as string
      fabric.Image.fromURL(url, (img: any) => {
        img.scaleToWidth(800)
        img.scaleToHeight(800)
        canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas), {
          scaleX: 800 / img.width,
          scaleY: 800 / img.height,
        })
      })
    }
    reader.readAsDataURL(e.target.files[0])
  }

  function clearCanvas() {
    if (!canvas) return
    canvas.clear()
    canvas.setBackgroundColor('#ffffff', canvas.renderAll.bind(canvas))
  }

  function bringForward() {
    if (!canvas) return
    const obj = canvas.getActiveObject()
    if (obj) { canvas.bringForward(obj); canvas.renderAll() }
  }

  function sendBackward() {
    if (!canvas) return
    const obj = canvas.getActiveObject()
    if (obj) { canvas.sendBackwards(obj); canvas.renderAll() }
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#0F0F1A]">
      <header className="border-b border-white/8 px-4 py-3 flex items-center gap-4">
        <Link href="/dashboard" className="text-white/40 text-sm hover:text-white">← Кабінет</Link>
        <h1 className="font-display font-bold text-white">Редактор</h1>
        <div className="flex items-center gap-2 ml-4">
          {/* Tools */}
          {[
            { id: 'select', icon: '↖', title: 'Вибір' },
            { id: 'text', icon: 'T', title: 'Текст', action: addText },
            { id: 'rect', icon: '▭', title: 'Прямокутник', action: addRect },
            { id: 'ellipse', icon: '○', title: 'Еліпс', action: addEllipse },
          ].map(t => (
            <button key={t.id}
              onClick={() => { setActiveTool(t.id as any); t.action?.() }}
              title={t.title}
              className={`w-9 h-9 rounded-lg font-bold text-sm transition-all ${activeTool === t.id ? 'bg-gold text-black' : 'bg-white/10 text-white hover:bg-white/20'}`}>
              {t.icon}
            </button>
          ))}
          <div className="w-px h-6 bg-white/15 mx-1"/>
          <button onClick={undo} disabled={historyIndex <= 0} title="Скасувати" className="w-9 h-9 rounded-lg bg-white/10 text-white hover:bg-white/20 disabled:opacity-30 text-sm font-bold">↩</button>
          <button onClick={redo} disabled={historyIndex >= history.length - 1} title="Повернути" className="w-9 h-9 rounded-lg bg-white/10 text-white hover:bg-white/20 disabled:opacity-30 text-sm font-bold">↪</button>
          <div className="w-px h-6 bg-white/15 mx-1"/>
          <button onClick={bringForward} title="Вперед" className="w-9 h-9 rounded-lg bg-white/10 text-white hover:bg-white/20 text-xs">↑L</button>
          <button onClick={sendBackward} title="Назад" className="w-9 h-9 rounded-lg bg-white/10 text-white hover:bg-white/20 text-xs">↓L</button>
          <button onClick={deleteSelected} title="Видалити" className="w-9 h-9 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 text-sm font-bold">✕</button>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={loadBackground}/>
          <button onClick={() => fileRef.current?.click()} className="bg-white/10 text-white/70 px-3 py-1.5 rounded-lg text-xs hover:bg-white/20">📎 Фон</button>
          <button onClick={clearCanvas} className="bg-white/10 text-white/70 px-3 py-1.5 rounded-lg text-xs hover:bg-white/20">🗑 Очистити</button>
          <button onClick={exportPNG} className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs hover:bg-indigo-500 font-semibold">PNG</button>
          <button onClick={exportJPEG} className="bg-gold text-black px-3 py-1.5 rounded-lg text-xs hover:bg-gold-light font-bold">JPEG</button>
          <a ref={exportRef} className="hidden"/>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center p-6 overflow-auto">
        {!fabricLoaded ? (
          <div className="text-center">
            <div className="w-10 h-10 border-2 border-gold border-t-transparent rounded-full animate-spin mx-auto mb-3"/>
            <p className="text-white/50">Завантажую редактор...</p>
          </div>
        ) : (
          <div className="shadow-2xl rounded-2xl overflow-hidden border border-white/10">
            <canvas ref={canvasRef}/>
          </div>
        )}
      </div>

      <div className="border-t border-white/8 px-4 py-2 flex items-center gap-4 text-xs text-white/30">
        <span>Canvas 800×800</span>
        <span>Fabric.js</span>
        <span>Ctrl+Z — undo · Delete — видалити виділене</span>
        <span className="ml-auto">Подвійний клік на текст для редагування</span>
      </div>
    </div>
  )
}
