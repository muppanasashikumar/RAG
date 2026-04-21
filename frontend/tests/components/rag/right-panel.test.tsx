import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

type DropzoneHook = {
  getRootProps: () => Record<string, unknown>;
  getInputProps: (overrides?: Record<string, unknown>) => Record<string, unknown>;
  isDragActive: boolean;
  open: () => void;
};

type DropzoneOptions = {
  onDropAccepted?: (files: File[]) => void;
  onDropRejected?: (rejections: Array<{ errors: Array<{ code: string }> }>) => void;
};

const dropzoneMock = {
  options: null as DropzoneOptions | null,
  openFn: vi.fn(),
};

vi.mock("react-dropzone", () => ({
  useDropzone: (options: DropzoneOptions): DropzoneHook => {
    dropzoneMock.options = options;
    return {
      getRootProps: () => ({ "data-testid": "dropzone-root" }),
      getInputProps: (overrides = {}) => ({
        "data-testid": "dropzone-input",
        type: "file",
        ...overrides,
      }),
      isDragActive: false,
      open: dropzoneMock.openFn,
    };
  },
}));

vi.mock("next/image", () => ({
  default: ({ src, alt, width, height }: { src: string; alt: string; width: number; height: number }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} width={width} height={height} />
  ),
}));

import { RightPanel } from "@/components/rag/right-panel";

describe("RightPanel", () => {
  beforeEach(() => {
    dropzoneMock.options = null;
    dropzoneMock.openFn.mockClear();
  });

  it("renders upload UI, the 'Agent controls' section, and shows placeholder copy when no file is selected", () => {
    render(
      <RightPanel
        uploadedFile={null}
        uploadedFileName=""
        onUploadedFileChange={() => {}}
      />,
    );

    expect(screen.getByText("Upload document")).toBeInTheDocument();
    expect(screen.getByText("Agent controls")).toBeInTheDocument();
    expect(screen.getByText("No document selected")).toBeInTheDocument();
    expect(
      screen.getByText("Upload a file to ground answers"),
    ).toBeInTheDocument();
  });

  it("lists the agent control cards", () => {
    render(
      <RightPanel
        uploadedFile={null}
        uploadedFileName=""
        onUploadedFileChange={() => {}}
      />,
    );
    expect(screen.getByText("Cited answers")).toBeInTheDocument();
    expect(screen.getByText("Memory")).toBeInTheDocument();
    expect(screen.getByText("Planner")).toBeInTheDocument();
  });

  it("shows the filename and the remove button when a file is present", async () => {
    const onUploadedFileChange = vi.fn();
    render(
      <RightPanel
        uploadedFile={null}
        uploadedFileName="policy.pdf"
        onUploadedFileChange={onUploadedFileChange}
      />,
    );

    expect(screen.getByText("policy.pdf")).toBeInTheDocument();
    expect(screen.getByText("Indexed for this chat")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Remove document" }),
    );
    expect(onUploadedFileChange).toHaveBeenCalledWith(null);
  });

  it("clicking 'Browse files' opens the native dropzone picker", async () => {
    render(
      <RightPanel
        uploadedFile={null}
        uploadedFileName=""
        onUploadedFileChange={() => {}}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Browse files" }),
    );
    expect(dropzoneMock.openFn).toHaveBeenCalled();
  });

  it("accepts a valid dropped file and forwards it through onUploadedFileChange", () => {
    const onUploadedFileChange = vi.fn();
    render(
      <RightPanel
        uploadedFile={null}
        uploadedFileName=""
        onUploadedFileChange={onUploadedFileChange}
      />,
    );

    const file = new File(["hello"], "notes.pdf", { type: "application/pdf" });
    act(() => {
      dropzoneMock.options?.onDropAccepted?.([file]);
    });
    expect(onUploadedFileChange).toHaveBeenCalledWith(file);
  });

  it("rejects oversized files with a size error and does not call onUploadedFileChange", () => {
    const onUploadedFileChange = vi.fn();
    render(
      <RightPanel
        uploadedFile={null}
        uploadedFileName=""
        onUploadedFileChange={onUploadedFileChange}
      />,
    );

    const big = new File([""], "big.pdf", { type: "application/pdf" });
    Object.defineProperty(big, "size", { value: 60 * 1024 * 1024 });

    act(() => {
      dropzoneMock.options?.onDropAccepted?.([big]);
    });

    expect(onUploadedFileChange).not.toHaveBeenCalled();
    expect(
      screen.getByText(/File is too large\. Maximum size is 50 MB/),
    ).toBeInTheDocument();
  });

  it("rejects unsupported extensions", () => {
    const onUploadedFileChange = vi.fn();
    render(
      <RightPanel
        uploadedFile={null}
        uploadedFileName=""
        onUploadedFileChange={onUploadedFileChange}
      />,
    );

    const bad = new File(["x"], "photo.png", { type: "image/png" });
    act(() => {
      dropzoneMock.options?.onDropAccepted?.([bad]);
    });

    expect(onUploadedFileChange).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Use a supported type: PDF, DOC, DOCX, TXT, or CSV\./),
    ).toBeInTheDocument();
  });

  it("shows a helpful message when dropzone rejects multiple files", () => {
    render(
      <RightPanel
        uploadedFile={null}
        uploadedFileName=""
        onUploadedFileChange={() => {}}
      />,
    );

    act(() => {
      dropzoneMock.options?.onDropRejected?.([
        { errors: [{ code: "too-many-files" }] },
        { errors: [{ code: "too-many-files" }] },
      ]);
    });

    expect(screen.getByText("Drop one file at a time.")).toBeInTheDocument();
  });

  it("shows the generic 'unsupported type' message for miscellaneous rejections", () => {
    render(
      <RightPanel
        uploadedFile={null}
        uploadedFileName=""
        onUploadedFileChange={() => {}}
      />,
    );

    act(() => {
      dropzoneMock.options?.onDropRejected?.([
        { errors: [{ code: "file-invalid-type" }] },
      ]);
    });

    expect(
      screen.getByText(/Use a supported type: PDF, DOC, DOCX, TXT, or CSV\./),
    ).toBeInTheDocument();
  });
});
