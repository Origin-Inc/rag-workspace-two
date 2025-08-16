import { useState } from "react";
import { InlineEditor } from "~/components/editor/InlineEditor";

export default function TestInlineEditor() {
  const [value1, setValue1] = useState("Initial text");
  const [value2, setValue2] = useState("");
  const [value3, setValue3] = useState("<b>Rich</b> text");
  
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto space-y-8">
        <h1 className="text-2xl font-bold mb-4">InlineEditor Test</h1>
        
        <div className="bg-white p-4 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-2">Basic Editor</h2>
          <InlineEditor
            value={value1}
            onChange={(val) => {
              console.log('Editor 1 onChange:', val);
              setValue1(val);
            }}
            placeholder="Type something..."
            className="border p-2 rounded"
          />
          <p className="text-sm text-gray-600 mt-2">Value: {value1}</p>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-2">Empty Editor</h2>
          <InlineEditor
            value={value2}
            onChange={(val) => {
              console.log('Editor 2 onChange:', val);
              setValue2(val);
            }}
            placeholder="Start typing..."
            className="border p-2 rounded"
          />
          <p className="text-sm text-gray-600 mt-2">Value: {value2}</p>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-2">Rich Text Editor</h2>
          <InlineEditor
            value={value3}
            onChange={(val) => {
              console.log('Editor 3 onChange:', val);
              setValue3(val);
            }}
            placeholder="Rich text..."
            allowFormatting={true}
            className="border p-2 rounded"
          />
          <p className="text-sm text-gray-600 mt-2">HTML: {value3}</p>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-2">Single Line Editor</h2>
          <InlineEditor
            value="Single line text"
            onChange={(val) => console.log('Single line:', val)}
            singleLine={true}
            className="border p-2 rounded"
          />
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-2">Read-only Editor</h2>
          <InlineEditor
            value="This is read-only"
            readOnly={true}
            className="border p-2 rounded bg-gray-50"
          />
        </div>
      </div>
    </div>
  );
}