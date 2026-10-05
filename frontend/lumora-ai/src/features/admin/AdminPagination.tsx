import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface AdminPaginationProps {
  page: number
  totalPages: number
  total: number
  onPageChange: (page: number) => void
}

const AdminPagination = ({ page, totalPages, total, onPageChange }: AdminPaginationProps) => {
  return (
    <div className="flex flex-col gap-3 border-t border-gray-200 px-6 py-4 text-sm text-gray-500 sm:flex-row sm:items-center sm:justify-between">
      <p>
        Page {page} of {Math.max(totalPages, 1)} · {total} total
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

export default AdminPagination
